import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client } from "@/lib/r2";
import { consumeAccessTicket, signedUrlTtlSeconds } from "@/lib/accessTicket";
import { sql } from "@/lib/db";
import { clientIpKey, enforceGlobalApiRateLimit, logSecurityEvent } from "@/lib/securityTelemetry";
import { decryptAes256Gcm, getMasterKeyById, unwrapDataKey } from "@/lib/encryption";
import { hashUserAgent, hashIpForTicket } from "@/lib/accessTicket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const t = consumed.ticket;

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
      const mk = getMasterKeyById(enc.keyVersion);
      if (!mk) throw new Error("Missing master key for encrypted document");
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

      void logSecurityEvent({
        type: "decrypt",
        severity: "low",
        ip,
        docId: t.doc_id,
        scope: "doc_decrypt",
        message: "Document decrypted for serving",
        meta: { keyVersion: enc.keyVersion },
      });

      // NextResponse expects a Web `BodyInit` type. Node `Buffer` isn't assignable in TS,
      // even though it's a Uint8Array at runtime. Convert explicitly.
      const responseBody = new Uint8Array(decrypted.buffer, decrypted.byteOffset, decrypted.byteLength);

      return new NextResponse(responseBody, {
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
  const signed = await getSignedUrl(
    r2Client,
    new GetObjectCommand({
      Bucket: t.r2_bucket,
      Key: t.r2_key,
      ResponseContentType: t.response_content_type,
      ResponseContentDisposition: t.response_content_disposition,
    }),
    { expiresIn: signedUrlTtlSeconds() }
  );

  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: signed,
      "Cache-Control": "private, no-store",
    },
  });
}
