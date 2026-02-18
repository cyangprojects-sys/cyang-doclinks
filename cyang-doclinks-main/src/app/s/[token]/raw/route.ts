// src/app/s/[token]/raw/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import crypto from "crypto";
import { r2Client } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import { resolveDoc, resolveShareMeta } from "@/lib/resolveDoc";
import {
  shareUnlockCookieName,
  verifyDeviceTrustCookieValue,
} from "@/lib/shareAuth";

function getClientIp(req: NextRequest) {
  const xff = req.headers.get("x-forwarded-for") || "";
  return xff.split(",")[0]?.trim() || "";
}

function hashIp(ip: string) {
  const salt = process.env.VIEW_SALT || process.env.SHARE_SALT || "";
  if (!salt || !ip) return null;
  return crypto.createHmac("sha256", salt).update(ip).digest("hex").slice(0, 32);
}

function safeFilename(name: string) {
  const cleaned = (name || "document.pdf").replace(/["\r\n]/g, "").trim();
  if (!cleaned) return "document.pdf";
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

async function isTrustedForToken(token: string, req: NextRequest): Promise<boolean> {
  const raw = req.cookies.get(shareUnlockCookieName())?.value || "";
  const v = verifyDeviceTrustCookieValue(raw);
  if (!v.ok) return false;
  if (v.token !== token) return false;

  // DB check (best-effort). If missing, trust signature/exp.
  try {
    const rows = (await sql`
      select 1
      from public.trusted_devices
      where share_id = ${token}
        and device_hash = ${v.deviceHash}
        and expires_at > now()
      limit 1
    `) as unknown as Array<{ "?column?": number }>;
    return rows.length > 0;
  } catch {
    return true;
  }
}

async function logAccess(req: NextRequest, opts: {
  token: string;
  emailUsed: string | null;
  success: boolean;
  failureReason: string | null;
}) {
  try {
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") || null;
    await sql`
      insert into public.doc_access_logs
        (share_id, ip, user_agent, email_used, success, failure_reason)
      values
        (${opts.token}, ${ip || null}, ${ua}, ${opts.emailUsed}, ${opts.success}, ${opts.failureReason})
    `;
  } catch {
    // best-effort
  }
}

export async function GET(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const t = (token || "").trim();
  if (!t) return new NextResponse("Not found", { status: 404 });

  // Resolve share meta for email/download flags (NO increment).
  const meta = await resolveShareMeta(t);
  if (!meta.ok) {
    await logAccess(req, { token: t, emailUsed: null, success: false, failureReason: "not_found" });
    return new NextResponse("Not found", { status: 404 });
  }

  // Central resolver:
  // - resolves share token
  // - enforces revoked/expired/max_views
  // - increments views atomically
  const resolved = await resolveDoc({ token: t });
  if (!resolved.ok) {
    await logAccess(req, { token: t, emailUsed: null, success: false, failureReason: resolved.error });
    return new NextResponse("Not found", { status: 404 });
  }

  const mustTrust = Boolean(resolved.requiresPassword || meta.allowedEmail);
  if (mustTrust) {
    const ok = await isTrustedForToken(t, req);
    if (!ok) {
      await logAccess(req, { token: t, emailUsed: null, success: false, failureReason: "not_trusted" });
      return NextResponse.redirect(new URL(`/s/${encodeURIComponent(t)}`, req.url), 302);
    }
  }

  // Analytics log (best-effort)
  try {
    const ip = getClientIp(req);
    const ipHash = hashIp(ip);
    const ua = req.headers.get("user-agent") || null;
    const ref = req.headers.get("referer") || null;

    await sql`
      insert into public.doc_views
        (doc_id, token, path, kind, user_agent, referer, ip_hash)
      values
        (${resolved.docId}::uuid, ${t}, ${new URL(req.url).pathname}, 'share_raw', ${ua}, ${ref}, ${ipHash})
    `;
  } catch {
    // ignore
  }

  // Stream from R2 with Range support
  const range = req.headers.get("range") ?? undefined;

  const obj = await r2Client.send(
    new GetObjectCommand({
      Bucket: resolved.bucket,
      Key: resolved.r2Key,
      Range: range,
    })
  );

  const body = obj.Body as Readable | undefined;
  if (!body) return new NextResponse("Not found", { status: 404 });

  const url = new URL(req.url);
  const downloadRequested = url.searchParams.get("download") === "1";
  const allowDownload = Boolean((resolved as any).allowDownload) || Boolean(meta.allowDownload);

  const displayName = resolved.originalFilename || resolved.title || "document.pdf";
  const filename = safeFilename(displayName);

  const headers = new Headers();
  headers.set("Content-Type", obj.ContentType || resolved.contentType || "application/pdf");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, no-store");

  const contentRange = (obj as any).ContentRange as string | undefined;
  if (contentRange) headers.set("Content-Range", contentRange);
  if (obj.ContentLength != null) headers.set("Content-Length", String(obj.ContentLength));

  // Download control:
  // - If allow_download is false, ALWAYS render inline and ignore download=1.
  // - If allow_download is true, support attachment via download=1.
  const disposition = allowDownload && downloadRequested ? "attachment" : "inline";
  headers.set("Content-Disposition", `${disposition}; filename="${filename}"`);

  await logAccess(req, { token: t, emailUsed: null, success: true, failureReason: null });

  return new NextResponse(body as any, {
    status: range ? 206 : 200,
    headers,
  });
}
