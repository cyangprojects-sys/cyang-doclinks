import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2Client } from "@/lib/r2";
import { consumeAccessTicket } from "@/lib/accessTicket";
import { sql } from "@/lib/db";
import { clientIpKey, enforceGlobalApiRateLimit, logDbErrorEvent, logSecurityEvent } from "@/lib/securityTelemetry";
import { decryptAes256Gcm, unwrapDataKey } from "@/lib/encryption";
import { getMasterKeyByIdOrThrow } from "@/lib/masterKeys";
import { hashUserAgent, hashIpForTicket } from "@/lib/accessTicket";
import { Readable } from "node:stream";
import { appendImmutableAudit } from "@/lib/immutableAudit";
import { allowUnencryptedServing, isSecurityTestNoDbMode, isTicketServingDisabled } from "@/lib/securityPolicy";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";
import { assertRuntimeEnv, isRuntimeEnvError } from "@/lib/runtimeEnv";
import { stampPdfWithWatermark } from "@/lib/pdfWatermark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function isBlockedTopLevelTicketOpen(req: NextRequest): boolean {
  const dest = (req.headers.get("sec-fetch-dest") || "").toLowerCase();
  const mode = (req.headers.get("sec-fetch-mode") || "").toLowerCase();
  const user = (req.headers.get("sec-fetch-user") || "").toLowerCase();
  return dest === "document" && mode === "navigate" && user === "?1";
}

function isDownloadTicket(
  ticket: { purpose?: string | null; response_content_disposition?: string | null } | null | undefined
): boolean {
  const purpose = String(ticket?.purpose || "").toLowerCase();
  const disposition = String(ticket?.response_content_disposition || "").toLowerCase();
  return (
    purpose === "file_download" ||
    purpose === "watermarked_file_download" ||
    disposition === "attachment"
  );
}

function looksLikePdf(contentType: string | null | undefined, key: string | null | undefined) {
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("application/pdf")) return true;
  return String(key || "").toLowerCase().endsWith(".pdf");
}

async function loadWatermarkIdentity(args: { docId: string | null; shareToken: string | null; alias: string | null }) {
  const defaults = {
    sharedBy: "unknown",
    openedBy: "anonymous",
  };
  if (!args.docId) return defaults;

  try {
    if (args.shareToken) {
      const rows = (await sql`
        select
          coalesce(u.email::text, '') as shared_by_email,
          coalesce(st.to_email::text, '') as opened_by_email
        from public.docs d
        left join public.users u on u.id = d.owner_id
        left join public.share_tokens st on st.doc_id = d.id and st.token = ${args.shareToken}
        where d.id = ${args.docId}::uuid
        limit 1
      `) as unknown as Array<{ shared_by_email: string; opened_by_email: string }>;
      const r = rows?.[0];
      return {
        sharedBy: String(r?.shared_by_email || defaults.sharedBy).trim() || defaults.sharedBy,
        openedBy: String(r?.opened_by_email || defaults.openedBy).trim() || defaults.openedBy,
      };
    }

    const rows = (await sql`
      select
        coalesce(u.email::text, '') as shared_by_email
      from public.docs d
      left join public.users u on u.id = d.owner_id
      where d.id = ${args.docId}::uuid
      limit 1
    `) as unknown as Array<{ shared_by_email: string }>;
    const r = rows?.[0];
    return {
      sharedBy: String(r?.shared_by_email || defaults.sharedBy).trim() || defaults.sharedBy,
      openedBy: args.alias ? `alias:${String(args.alias).slice(0, 24)}` : defaults.openedBy,
    };
  } catch {
    return defaults;
  }
}

function secureDocHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...(extra || {}),
  };
}

function isR2MissingObjectError(err: unknown): boolean {
  const e = err as any;
  const code = String(e?.Code || e?.code || e?.name || "").toLowerCase();
  const status = Number(e?.$metadata?.httpStatusCode || e?.statusCode || 0);
  if (status === 404) return true;
  return code.includes("nosuchkey") || code.includes("notfound") || code.includes("not_found");
}

function toWebStream(body: any): ReadableStream<Uint8Array> {
  // AWS SDK v3 in Node returns a Node.js Readable stream.
  // NextResponse expects a web stream (or a Blob/Buffer).
  if (!body) {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
  }
  // If it already looks like a web stream, return as-is.
  if (typeof body?.getReader === "function") return body as ReadableStream<Uint8Array>;
  // Convert Node Readable -> Web ReadableStream
  try {
    return Readable.toWeb(body) as unknown as ReadableStream<Uint8Array>;
  } catch {
    // Fallback: buffer the whole response (last resort)
    const rs = new ReadableStream<Uint8Array>({
      async start(controller) {
        const ab = body?.transformToByteArray
          ? await body.transformToByteArray()
          : Buffer.from(await new Response(body).arrayBuffer());
        controller.enqueue(new Uint8Array(ab));
        controller.close();
      },
    });
    return rs;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_TICKET_SERVE_MS", 30_000);
  try {
    return await withRouteTimeout(
      (async () => {
        assertRuntimeEnv("ticket_serve");

        if (isSecurityTestNoDbMode()) {
          return new NextResponse("Direct open is disabled for this protected document.", {
            status: 403,
            headers: secureDocHeaders(),
          });
        }

  if (await isTicketServingDisabled()) {
    return new NextResponse("Unavailable", { status: 503, headers: secureDocHeaders() });
  }

  const { ticketId } = await params;

  // Throttle ticket exchange (prevents hotlink storms)
  const ticketRl = await enforceGlobalApiRateLimit({
    req,
    scope: "ip:ticket",
    limit: Number(process.env.RATE_LIMIT_TICKET_IP_PER_MIN || 240),
    windowSeconds: 60,
    strict: true,
  });
  if (!ticketRl.ok) {
    return new NextResponse("Too Many Requests", {
      status: ticketRl.status,
      headers: secureDocHeaders({ "Retry-After": String(ticketRl.retryAfterSeconds) }),
    });
  }

  const consumed = await consumeAccessTicket({ req, ticketId });
  if (!consumed.ok) {
    void logSecurityEvent({
      type: "ticket_consume_denied",
      severity: "medium",
      ip: clientIpKey(req).ip,
      scope: "ticket_serve",
      message: "Access ticket consume denied",
      meta: { ticketId },
    });
    return new NextResponse("Not found", {
      status: 404,
      headers: secureDocHeaders(),
    });
  }

  const t = consumed.ticket;
  const downloadTicket = isDownloadTicket(t);
  const shouldPdfWatermarkDownload = downloadTicket && looksLikePdf(t.response_content_type, t.r2_key);
  const requestIpHash = hashIpForTicket(clientIpKey(req).ip)?.slice(0, 10) || null;
  const requestUaHash = hashUserAgent(req.headers.get("user-agent"))?.slice(0, 10) || null;
  if (isBlockedTopLevelTicketOpen(req) && !downloadTicket) {
    return new NextResponse("Direct open is disabled for this protected document.", {
      status: 403,
      headers: secureDocHeaders(),
    });
  }
  if (t.doc_id) {
    try {
      const rows = (await sql`
        select
          coalesce(moderation_status::text, 'active') as moderation_status,
          coalesce(scan_status::text, 'unscanned') as scan_status
        from public.docs
        where id = ${t.doc_id}::uuid
        limit 1
      `) as unknown as Array<{ moderation_status: string; scan_status: string }>;

      const row = rows?.[0];
      const moderation = (row?.moderation_status || "active").toLowerCase();
      const scanStatus = (row?.scan_status || "unscanned").toLowerCase();

      if (moderation === "deleted" || moderation === "disabled") {
        return new NextResponse("Unavailable", { status: 404, headers: secureDocHeaders() });
      }
      if (moderation === "quarantined") {
        return new NextResponse("Unavailable", { status: 404, headers: secureDocHeaders() });
      }
      // Critical invariant: serve/download only after scan is explicitly clean.
      if (scanStatus !== "clean") {
        return new NextResponse("Unavailable", { status: 404, headers: secureDocHeaders() });
      }
    } catch {
      return new NextResponse("Unavailable", { status: 404, headers: secureDocHeaders() });
    }
  }

  // If the doc is encrypted, we must proxy + decrypt server-side.
  let enc:
    | {
        enabled: true;
        alg: string;
        iv: Buffer;
        keyVersion: string;
        wrappedKey: Buffer;
        wrapIv: Buffer;
        wrapTag: Buffer;
      }
    | { enabled: false } = { enabled: false };
  let encryptionMetaInvalid: { missingKeyVersion: boolean } | null = null;

  if (t.doc_id) {
    try {
      const rows = (await sql`
        select
          coalesce(encryption_enabled, false) as encryption_enabled,
          coalesce(enc_alg, '')::text as enc_alg,
          enc_iv as enc_iv,
          coalesce(enc_key_version, '')::text as enc_key_version,
          enc_wrapped_key as enc_wrapped_key,
          enc_wrap_iv as enc_wrap_iv,
          enc_wrap_tag as enc_wrap_tag
        from public.docs
        where id = ${t.doc_id}::uuid
        limit 1
      `) as unknown as Array<{
        encryption_enabled: boolean;
        enc_alg: string;
        enc_iv: Buffer | null;
        enc_key_version: string;
        enc_wrapped_key: Buffer | null;
        enc_wrap_iv: Buffer | null;
        enc_wrap_tag: Buffer | null;
      }>;

      const r = rows?.[0];
      if (r?.encryption_enabled) {
        const hasAllEncryptionMeta = Boolean(
          r.enc_alg &&
            r.enc_iv &&
            r.enc_key_version &&
            r.enc_wrapped_key &&
            r.enc_wrap_iv &&
            r.enc_wrap_tag
        );
        if (!hasAllEncryptionMeta) {
          encryptionMetaInvalid = { missingKeyVersion: !r.enc_key_version };
        } else {
          enc = {
            enabled: true,
            alg: r.enc_alg,
            iv: r.enc_iv!,
            keyVersion: r.enc_key_version,
            wrappedKey: r.enc_wrapped_key!,
            wrapIv: r.enc_wrap_iv!,
            wrapTag: r.enc_wrap_tag!,
          };
        }
      }
    } catch {
      // ignore
    }
  }

  if (encryptionMetaInvalid) {
    void logSecurityEvent({
      type: "ticket_serve_encryption_meta_missing",
      severity: "high",
      ip: clientIpKey(req).ip,
      docId: t.doc_id,
      scope: "ticket_serve",
      message: "Encrypted document is missing required key metadata",
      meta: {
        missingKeyVersion: encryptionMetaInvalid.missingKeyVersion,
      },
    });
    return new NextResponse("Unavailable", { status: 500, headers: secureDocHeaders() });
  }

  if (enc.enabled) {
    try {
      const mk = await getMasterKeyByIdOrThrow(enc.keyVersion);
      const dataKey = unwrapDataKey({
        wrapped: enc.wrappedKey,
        wrapIv: enc.wrapIv,
        wrapTag: enc.wrapTag,
        masterKey: mk.key,
      });

      let obj: any;
      try {
        obj = await r2Client.send(
          new GetObjectCommand({
            Bucket: t.r2_bucket,
            Key: t.r2_key,
          })
        );
      } catch (e: unknown) {
        if (isR2MissingObjectError(e)) {
          void logSecurityEvent({
            type: "serve_r2_object_missing",
            severity: "high",
            ip: clientIpKey(req).ip,
            docId: t.doc_id,
            scope: "ticket_serve",
            message: "Referenced R2 object is missing",
            meta: { bucket: t.r2_bucket, key: t.r2_key },
          });
          return new NextResponse("Not found", { status: 404, headers: secureDocHeaders() });
        }
        throw e;
      }

      const body = obj?.Body as any;
      const ab = body?.transformToByteArray
        ? await body.transformToByteArray()
        : Buffer.from(await new Response(body).arrayBuffer());

      let decrypted = decryptAes256Gcm({ ciphertext: Buffer.from(ab), iv: enc.iv, key: dataKey });

      if (shouldPdfWatermarkDownload) {
        const identity = await loadWatermarkIdentity({
          docId: t.doc_id || null,
          shareToken: t.share_token || null,
          alias: t.alias || null,
        });
        decrypted = await stampPdfWithWatermark(Buffer.from(decrypted), {
          identity: { kind: "known", label: `${identity.sharedBy} -> ${identity.openedBy}` },
          timestampIso: new Date().toISOString(),
          shareIdShort: (t.share_token || t.alias || "direct").slice(0, 12),
          docIdShort: String(t.doc_id || "unknown").slice(0, 12),
          sharedBy: identity.sharedBy,
          openedBy: identity.openedBy,
          ipHashShort: requestIpHash,
          uaHashShort: requestUaHash,
          customText: "cyang.io",
        });
      }

      // Audit decrypt event (best-effort)
      const ip = clientIpKey(req).ip;
      const ua = req.headers.get("user-agent") || null;
      try {
        await sql`
          insert into public.doc_decrypt_log
            (doc_id, ticket_id, ip_hash, ua_hash, key_version)
          values
            (${t.doc_id}::uuid, ${t.id}::uuid, ${hashIpForTicket(ip)}, ${hashUserAgent(ua)}, ${enc.keyVersion})
        `;
      } catch {
        // ignore
      }

      await appendImmutableAudit({
        streamKey: `doc:${t.doc_id}`,
        action: "doc.decrypt",
        docId: t.doc_id,
        subjectId: t.id,
        ipHash: hashIpForTicket(ip),
        payload: {
          keyVersion: enc.keyVersion,
          purpose: t.purpose ?? null,
        },
      });

      void logSecurityEvent({
        type: "decrypt",
        severity: "low",
        ip,
        docId: t.doc_id,
        scope: "doc_decrypt",
        message: "Document decrypted for serving",
        meta: { keyVersion: enc.keyVersion },
      });

      const responseBlob = new Blob([new Uint8Array(decrypted)]);

      return new NextResponse(responseBlob, {
        status: 200,
        headers: secureDocHeaders({
          "Content-Type": t.response_content_type || "application/pdf",
          "Content-Disposition": t.response_content_disposition || "inline",
        }),
      });
    } catch (e: any) {
      void logSecurityEvent({
        type: "anomaly",
        severity: "high",
        ip: clientIpKey(req).ip,
        docId: t.doc_id,
        scope: "doc_decrypt_error",
        message: e?.message || "Decrypt failed",
      });
      return new NextResponse("Server error", { status: 500, headers: secureDocHeaders() });
    }
  }

  // Platform policy: legacy unencrypted files are blocked unless explicitly allowed.
  if (!allowUnencryptedServing()) {
    void logSecurityEvent({
      type: "unencrypted_serve_blocked",
      severity: "high",
      ip: clientIpKey(req).ip,
      docId: t.doc_id,
      scope: "ticket_serve",
      message: "Serving blocked for unencrypted document by policy",
    });
    return new NextResponse("Unavailable", { status: 403, headers: secureDocHeaders() });
  }

  // Same-origin proxy for non-encrypted docs.
  // This avoids CSP "frame-src" issues caused by redirecting the browser to the R2 bucket hostname.
  // Also prevents leaking presigned URLs into client-side logs/telemetry.
  const range = req.headers.get("range") || undefined;

  let obj: any;
  try {
    obj = await r2Client.send(
      new GetObjectCommand({
        Bucket: t.r2_bucket,
        Key: t.r2_key,
        Range: range,
        ResponseContentType: t.response_content_type || undefined,
        ResponseContentDisposition: t.response_content_disposition || undefined,
      })
    );
  } catch (e: unknown) {
    if (isR2MissingObjectError(e)) {
      void logSecurityEvent({
        type: "serve_r2_object_missing",
        severity: "high",
        ip: clientIpKey(req).ip,
        docId: t.doc_id,
        scope: "ticket_serve",
        message: "Referenced R2 object is missing",
        meta: { bucket: t.r2_bucket, key: t.r2_key },
      });
      return new NextResponse("Not found", { status: 404, headers: secureDocHeaders() });
    }
    throw e;
  }

  const headers = secureDocHeaders({
    "Content-Type": t.response_content_type || "application/pdf",
    "Content-Disposition": t.response_content_disposition || "inline",
    // PDF viewers like Range support; we forward range responses when present.
    "Accept-Ranges": "bytes",
  });

  const contentRange = (obj as any)?.ContentRange as string | undefined;
  const contentLength = (obj as any)?.ContentLength as number | undefined;
  if (contentRange) headers["Content-Range"] = contentRange;
  if (typeof contentLength === "number") headers["Content-Length"] = String(contentLength);

  if (shouldPdfWatermarkDownload) {
    const body = obj?.Body as any;
    const ab = body?.transformToByteArray
      ? await body.transformToByteArray()
      : Buffer.from(await new Response(body).arrayBuffer());
    const identity = await loadWatermarkIdentity({
      docId: t.doc_id || null,
      shareToken: t.share_token || null,
      alias: t.alias || null,
    });
    const stamped = await stampPdfWithWatermark(Buffer.from(ab), {
      identity: { kind: "known", label: `${identity.sharedBy} -> ${identity.openedBy}` },
      timestampIso: new Date().toISOString(),
      shareIdShort: (t.share_token || t.alias || "direct").slice(0, 12),
      docIdShort: String(t.doc_id || "unknown").slice(0, 12),
      sharedBy: identity.sharedBy,
      openedBy: identity.openedBy,
      ipHashShort: requestIpHash,
      uaHashShort: requestUaHash,
      customText: "cyang.io",
    });

    return new NextResponse(new Blob([new Uint8Array(stamped)]), {
      status: 200,
      headers: secureDocHeaders({
        "Content-Type": t.response_content_type || "application/pdf",
        "Content-Disposition": t.response_content_disposition || "attachment",
      }),
    });
  }

        return new NextResponse(toWebStream((obj as any).Body), {
          status: contentRange ? 206 : 200,
          headers,
        });
      })(),
      timeoutMs
    );
  } catch (e: unknown) {
    if (isRuntimeEnvError(e)) {
      return new NextResponse("Unavailable", { status: 503, headers: secureDocHeaders() });
    }
    if (isRouteTimeoutError(e)) {
      void logSecurityEvent({
        type: "ticket_serve_timeout",
        severity: "high",
        ip: clientIpKey(req).ip,
        scope: "ticket_serve",
        message: "Ticket serve exceeded timeout",
        meta: { timeoutMs },
      });
      return new NextResponse("Gateway Timeout", { status: 504, headers: secureDocHeaders() });
    }
    if (e instanceof Error) {
      await logDbErrorEvent({
        scope: "ticket_serve",
        message: e.message,
        ip: clientIpKey(req).ip,
        meta: { route: "/t/[ticketId]" },
      });
    }
    return new NextResponse("Unavailable", { status: 503, headers: secureDocHeaders() });
  }
}
