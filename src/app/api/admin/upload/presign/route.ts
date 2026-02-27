import { NextResponse } from "next/server";
import { z } from "zod";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "node:crypto";

import { sql } from "@/lib/db";
import { getR2Bucket, r2Client } from "@/lib/r2";
import { requireUser } from "@/lib/authz";
import { assertCanUpload } from "@/lib/monetization";
import { enforcePlanLimitsEnabled } from "@/lib/billingFlags";
import {
  enforceGlobalApiRateLimit,
  clientIpKey,
  detectPresignFailureSpike,
  enforceIpAbuseBlock,
  logSecurityEvent,
  maybeBlockIpOnAbuse,
} from "@/lib/securityTelemetry";
import { generateDataKey, generateIv, wrapDataKey } from "@/lib/encryption";
import { getActiveMasterKeyOrThrow } from "@/lib/masterKeys";
import { appendImmutableAudit } from "@/lib/immutableAudit";
import { reportException } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Enterprise: encryption is mandatory.
// We keep "encrypt" in the schema for backward compatibility, but it must be true (or omitted).
const BodySchema = z.object({
  title: z.string().optional(),
  filename: z.string().min(1).max(240),
  contentType: z.string().optional(),
  sizeBytes: z.number().int().positive().optional(),
  encrypt: z.boolean().optional(),
});

function safeKeyPart(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").slice(0, 120);
}

function isSafeUploadFilename(name: string): boolean {
  const n = String(name || "").trim();
  if (!n) return false;
  if (n.length > 240) return false;
  if (/[\\/:*?"<>|]/.test(n)) return false;
  if (n.includes("..")) return false;
  return /\.pdf$/i.test(n);
}

function getKeyPrefix() {
  const p = process.env.R2_PREFIX || "docs/";
  if (p.startsWith("r2://")) return "docs/";
  return p.endsWith("/") ? p : `${p}/`;
}

export async function POST(req: Request) {
  const ipInfo = clientIpKey(req);
  try {
    const abuseBlock = await enforceIpAbuseBlock({ req, scope: "upload_presign" });
    if (!abuseBlock.ok) {
      return NextResponse.json(
        { ok: false, error: "ABUSE_BLOCKED" },
        { status: 403, headers: { "Retry-After": String(abuseBlock.retryAfterSeconds) } }
      );
    }
    const r2Bucket = getR2Bucket();
    const user = await requireUser();

    // Global API throttle (best-effort)
    const globalRl = await enforceGlobalApiRateLimit({
      req,
      scope: "ip:api",
      limit: Number(process.env.RATE_LIMIT_API_IP_PER_MIN || 240),
      windowSeconds: 60,
      actorUserId: user.id,
      orgId: user.orgId ?? null,
      strict: true,
    });
    if (!globalRl.ok) {
      return NextResponse.json(
        { ok: false, error: "RATE_LIMIT" },
        { status: globalRl.status, headers: { "Retry-After": String(globalRl.retryAfterSeconds) } }
      );
    }

    // Upload presign throttle per-IP (stronger)
    const presignRl = await enforceGlobalApiRateLimit({
      req,
      scope: "ip:upload_presign",
      limit: Number(process.env.RATE_LIMIT_UPLOAD_PRESIGN_IP_PER_MIN || 30),
      windowSeconds: 60,
      actorUserId: user.id,
      orgId: user.orgId ?? null,
      strict: true,
    });
    if (!presignRl.ok) {
      await logSecurityEvent({
        type: "upload_throttle",
        severity: "medium",
        ip: ipInfo.ip,
        actorUserId: user.id,
        orgId: user.orgId ?? null,
        scope: "ip:upload_presign",
        message: "Upload presign throttled",
      });
      await maybeBlockIpOnAbuse({
        ip: ipInfo.ip,
        category: "upload_presign_abuse",
        scope: "upload_presign",
        threshold: Number(process.env.ABUSE_BLOCK_PRESIGN_THRESHOLD || 20),
        windowSeconds: Number(process.env.ABUSE_BLOCK_PRESIGN_WINDOW_SECONDS || 600),
        blockSeconds: Number(process.env.ABUSE_BLOCK_TTL_SECONDS || 3600),
        reason: "Repeated upload presign abuse",
      });
      return NextResponse.json(
        { ok: false, error: "RATE_LIMIT" },
        { status: presignRl.status, headers: { "Retry-After": String(presignRl.retryAfterSeconds) } }
      );
    }

    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
    }

    const { title, filename } = parsed.data;
    if (!isSafeUploadFilename(filename)) {
      return NextResponse.json(
        { ok: false, error: "BAD_FILENAME", message: "filename must be a safe .pdf filename." },
        { status: 400 }
      );
    }

    // Enterprise mode: encryption is mandatory for everyone.
    // Non-owner accounts are allowed to upload; they just cannot disable encryption.
    const encryptRequested = parsed.data.encrypt;
    if (encryptRequested === false) {
      return NextResponse.json(
        { ok: false, error: "ENCRYPTION_REQUIRED", message: "Encryption is mandatory." },
        { status: 400 }
      );
    }
    const contentType = (parsed.data.contentType ?? "application/pdf").toLowerCase();
    const sizeBytes = parsed.data.sizeBytes ?? null;
    const absMax = Number(process.env.UPLOAD_ABSOLUTE_MAX_BYTES || 26_214_400); // 25 MB default

    // Hard enforcement needs an explicit sizeBytes to prevent bypassing storage/file-size caps.
    if (enforcePlanLimitsEnabled() && (sizeBytes == null || !Number.isFinite(sizeBytes) || sizeBytes <= 0)) {
      return NextResponse.json({ ok: false, error: "MISSING_SIZE", message: "sizeBytes is required." }, { status: 400 });
    }
    if (sizeBytes != null && Number.isFinite(absMax) && absMax > 0 && sizeBytes > absMax) {
      return NextResponse.json(
        { ok: false, error: "FILE_TOO_LARGE", message: `File exceeds absolute limit (${absMax} bytes).` },
        { status: 413 }
      );
    }

    if (contentType !== "application/pdf" && contentType !== "application/x-pdf") {
      return NextResponse.json({ ok: false, error: "NOT_PDF" }, { status: 400 });
    }

    // --- Monetization / plan limits (hidden) ---
    const canUpload = await assertCanUpload({ userId: user.id, sizeBytes: sizeBytes ?? null });
    if (!canUpload.ok) {
      return NextResponse.json({ ok: false, error: canUpload.error, message: canUpload.message }, { status: 403 });
    }

    // --- Mandatory encryption configuration ---
    let mk;
    try {
      mk = await getActiveMasterKeyOrThrow();
    } catch (e: unknown) {
      const msg = e instanceof Error && e.message === "MASTER_KEY_REVOKED" ? "Active master key is revoked." : "Missing DOC_MASTER_KEYS.";
      await logSecurityEvent({
        type: "upload_presign_error",
        severity: "high",
        ip: ipInfo.ip,
        actorUserId: user.id,
        orgId: user.orgId ?? null,
        scope: "upload_presign",
        message: "Encryption configuration unavailable during presign",
        meta: { reason: msg },
      });
      await detectPresignFailureSpike({ ip: ipInfo.ip });
      return NextResponse.json(
        { ok: false, error: "ENCRYPTION_NOT_CONFIGURED", message: msg },
        { status: 500 }
      );
    }

    const docId = crypto.randomUUID();
    const keyPrefix = getKeyPrefix();
    const safeName = safeKeyPart(filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`);
    const key = `${keyPrefix}${docId}_${safeName}`;

    const createdByEmail = user.email;

    // Per-document encryption metadata (always enabled)
    const dataKey = generateDataKey();
    const wrap = wrapDataKey({ dataKey, masterKey: mk.key });

    const encAlg = "AES-256-GCM";
    const encIv = generateIv();
    const encKeyVersion = mk.id;

    await sql`
      insert into docs (
        id,
        org_id,
        owner_id,
        title,
        original_filename,
        content_type,
        size_bytes,
        r2_bucket,
        r2_key,
        created_by_email,
        status,
        encryption_enabled,
        enc_alg,
        enc_iv,
        enc_key_version,
        enc_wrapped_key,
        enc_wrap_iv,
        enc_wrap_tag
      )
      values (
        ${docId}::uuid,
        ${user.orgId ? user.orgId : null}::uuid,
        ${user.id}::uuid,
        ${title ?? filename},
        ${filename},
        ${contentType},
        ${sizeBytes}::bigint,
        ${r2Bucket},
        ${key},
        ${createdByEmail},
        'uploading',
        true,
        ${encAlg},
        ${encIv},
        ${encKeyVersion},
        ${wrap.wrapped},
        ${wrap.iv},
        ${wrap.tag}
      )
    `;

    await appendImmutableAudit({
      streamKey: `doc:${docId}`,
      action: "doc.upload_initiated",
      actorUserId: user.id,
      orgId: user.orgId ?? null,
      docId,
      ipHash: ipInfo.ipHash,
      payload: {
        encryptionEnabled: true,
        encAlg,
        encKeyVersion,
        contentType,
        sizeBytes,
        filename,
      },
    });

    const expiresIn = 10 * 60;

    const putParams: any = {
      Bucket: r2Bucket,
      Key: key,
      // The uploaded object is encrypted bytes (ciphertext), not a literal PDF.
      // We still enforce that the *original* file is a PDF via request validation,
      // and bind that fact into signed metadata.
      ContentType: "application/octet-stream",
      Metadata: {
        "doc-id": docId,
        "orig-content-type": "application/pdf",
      },
    };

    const unhoistableHeaders = new Set([
      "content-type",
      "x-amz-meta-doc-id",
      "x-amz-meta-orig-content-type",
    ]);

    const uploadUrl = await getSignedUrl(r2Client, new PutObjectCommand(putParams), {
      expiresIn,
      unhoistableHeaders,
    });

    return NextResponse.json({
      ok: true,
      doc_id: docId,
      upload_url: uploadUrl,
      r2_key: key,
      bucket: r2Bucket,
      expires_in: expiresIn,
      encryption: { enabled: true, alg: encAlg, iv_b64: encIv.toString("base64"), data_key_b64: dataKey.toString("base64") },
    });
  } catch (err: unknown) {
    await logSecurityEvent({
      type: "upload_presign_error",
      severity: "high",
      ip: ipInfo.ip,
      scope: "upload_presign",
      message: "Unhandled presign error",
      meta: { error: err instanceof Error ? err.message : String(err) },
    });
    await detectPresignFailureSpike({ ip: ipInfo.ip });
    await reportException({
      error: err,
      event: "upload_presign_route_error",
      context: { route: "/api/admin/upload/presign" },
    });
    return NextResponse.json(
      { ok: false, error: "SERVER_ERROR", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
