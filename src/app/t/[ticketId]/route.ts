import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2Client } from "@/lib/r2";
import { consumeAccessTicket } from "@/lib/accessTicket";
import { sql } from "@/lib/db";
import { clientIpKey, enforceGlobalApiRateLimit, logSecurityEvent } from "@/lib/securityTelemetry";
import { decryptAes256Gcm, unwrapDataKey } from "@/lib/encryption";
import { getMasterKeyByIdOrThrow } from "@/lib/masterKeys";
import { hashUserAgent, hashIpForTicket } from "@/lib/accessTicket";
import { Readable } from "node:stream";
import { appendImmutableAudit } from "@/lib/immutableAudit";
import { allowUnencryptedServing } from "@/lib/securityPolicy";
import { hasActiveQuarantineOverride } from "@/lib/quarantineOverride";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  const { ticketId } = await params;

  // Throttle ticket exchange (prevents hotlink storms)
  const ticketRl = await enforceGlobalApiRateLimit({
    req,
    scope: "ip:ticket",
    limit: Number(process.env.RATE_LIMIT_TICKET_IP_PER_MIN || 240),
    windowSeconds: 60,
  });
  if (!ticketRl.ok) {
    return new NextResponse("Too Many Requests", {
      status: ticketRl.status,
      headers: { "Retry-After": String(ticketRl.retryAfterSeconds), "Cache-Control": "private, no-store" },
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
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const t = consumed.ticket;
  const blockedScanStates = new Set(["failed", "error", "infected", "quarantined"]);

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
        return new NextResponse("Unavailable", { status: 404, headers: { "Cache-Control": "private, no-store" } });
      }
      if (moderation === "quarantined") {
        const override = await hasActiveQuarantineOverride(t.doc_id);
        if (!override) {
          return new NextResponse("Unavailable", { status: 404, headers: { "Cache-Control": "private, no-store" } });
        }
      }
      if (blockedScanStates.has(scanStatus)) {
        return new NextResponse("Unavailable", { status: 404, headers: { "Cache-Control": "private, no-store" } });
      }
    } catch {
      return new NextResponse("Unavailable", { status: 404, headers: { "Cache-Control": "private, no-store" } });
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
      if (
        r?.encryption_enabled &&
        r.enc_alg &&
        r.enc_iv &&
        r.enc_key_version &&
        r.enc_wrapped_key &&
        r.enc_wrap_iv &&
        r.enc_wrap_tag
      ) {
        enc = {
          enabled: true,
          alg: r.enc_alg,
          iv: r.enc_iv,
          keyVersion: r.enc_key_version,
          wrappedKey: r.enc_wrapped_key,
          wrapIv: r.enc_wrap_iv,
          wrapTag: r.enc_wrap_tag,
        };
      }
    } catch {
      // ignore
    }
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

      const obj = await r2Client.send(
        new GetObjectCommand({
          Bucket: t.r2_bucket,
          Key: t.r2_key,
        })
      );

      const body = obj.Body as any;
      const ab = body?.transformToByteArray
        ? await body.transformToByteArray()
        : Buffer.from(await new Response(body).arrayBuffer());

      const decrypted = decryptAes256Gcm({ ciphertext: Buffer.from(ab), iv: enc.iv, key: dataKey });

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
        headers: {
          "Content-Type": t.response_content_type || "application/pdf",
          "Content-Disposition": t.response_content_disposition || "inline",
          "Cache-Control": "private, no-store",
        },
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
      return new NextResponse("Server error", { status: 500, headers: { "Cache-Control": "private, no-store" } });
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
    return new NextResponse("Unavailable", { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }

  // Same-origin proxy for non-encrypted docs.
  // This avoids CSP "frame-src" issues caused by redirecting the browser to the R2 bucket hostname.
  // Also prevents leaking presigned URLs into client-side logs/telemetry.
  const range = req.headers.get("range") || undefined;

  const obj = await r2Client.send(
    new GetObjectCommand({
      Bucket: t.r2_bucket,
      Key: t.r2_key,
      Range: range,
      ResponseContentType: t.response_content_type || undefined,
      ResponseContentDisposition: t.response_content_disposition || undefined,
    })
  );

  const headers: Record<string, string> = {
    "Content-Type": t.response_content_type || "application/pdf",
    "Content-Disposition": t.response_content_disposition || "inline",
    "Cache-Control": "private, no-store",
    // PDF viewers like Range support; we forward range responses when present.
    "Accept-Ranges": "bytes",
  };

  const contentRange = (obj as any)?.ContentRange as string | undefined;
  const contentLength = (obj as any)?.ContentLength as number | undefined;
  if (contentRange) headers["Content-Range"] = contentRange;
  if (typeof contentLength === "number") headers["Content-Length"] = String(contentLength);

  return new NextResponse(toWebStream((obj as any).Body), {
    status: contentRange ? 206 : 200,
    headers,
  });
}
