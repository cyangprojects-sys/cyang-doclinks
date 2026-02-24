import { NextResponse } from "next/server";
import { z } from "zod";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "node:crypto";

import { sql } from "@/lib/db";
import { r2Client, r2Bucket } from "@/lib/r2";
import { requireUser } from "@/lib/authz";
import { assertCanUpload } from "@/lib/monetization";
import { enforcePlanLimitsEnabled } from "@/lib/billingFlags";
import { enforceGlobalApiRateLimit, clientIpKey, logSecurityEvent } from "@/lib/securityTelemetry";
import { generateDataKey, generateIv, getActiveMasterKey, wrapDataKey } from "@/lib/encryption";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  title: z.string().optional(),
  filename: z.string().min(1),
  contentType: z.string().optional(),
  sizeBytes: z.number().int().positive().optional(),
  encrypt: z.boolean().optional(),
});

function safeKeyPart(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").slice(0, 120);
}

function getKeyPrefix() {
  const p = process.env.R2_PREFIX || "docs/";
  if (p.startsWith("r2://")) return "docs/";
  return p.endsWith("/") ? p : `${p}/`;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();

    // Global API throttle (best-effort)
    const globalRl = await enforceGlobalApiRateLimit({
      req,
      scope: "ip:api",
      limit: Number(process.env.RATE_LIMIT_API_IP_PER_MIN || 240),
      windowSeconds: 60,
      actorUserId: user.id,
      orgId: user.orgId ?? null,
    });
    if (!globalRl.ok) {
      return NextResponse.json(
        { ok: false, error: "RATE_LIMIT" },
        { status: globalRl.status, headers: { "Retry-After": String(globalRl.retryAfterSeconds) } }
      );
    }

    // Upload presign throttle per-IP (stronger)
    const ipInfo = clientIpKey(req);
    const presignRl = await enforceGlobalApiRateLimit({
      req,
      scope: "ip:upload_presign",
      limit: Number(process.env.RATE_LIMIT_UPLOAD_PRESIGN_IP_PER_MIN || 30),
      windowSeconds: 60,
      actorUserId: user.id,
      orgId: user.orgId ?? null,
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
    const encrypt = Boolean(parsed.data.encrypt);
    const contentType = parsed.data.contentType ?? "application/pdf";
    const sizeBytes = parsed.data.sizeBytes ?? null;

    // Hard enforcement needs an explicit sizeBytes to prevent bypassing storage/file-size caps.
    if (enforcePlanLimitsEnabled() && (sizeBytes == null || !Number.isFinite(sizeBytes) || sizeBytes <= 0)) {
      return NextResponse.json(
        { ok: false, error: "MISSING_SIZE", message: "sizeBytes is required." },
        { status: 400 }
      );
    }

    if (contentType !== "application/pdf") {
      return NextResponse.json({ ok: false, error: "NOT_PDF" }, { status: 400 });
    }

    // --- Monetization / plan limits (hidden) ---
    const canUpload = await assertCanUpload({ userId: user.id, sizeBytes: sizeBytes ?? null });
    if (!canUpload.ok) {
      return NextResponse.json(
        { ok: false, error: canUpload.error, message: canUpload.message },
        { status: 403 }
      );
    }

    const docId = crypto.randomUUID();
    const keyPrefix = getKeyPrefix();
    const safeName = safeKeyPart(filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`);
    const key = `${keyPrefix}${docId}_${safeName}`;

    const createdByEmail = user.email;

    // Optional per-document encryption metadata
    let encryptionEnabled = false;
    let encAlg: string | null = null;
    let encIv: Buffer | null = null;
    let encKeyVersion: string | null = null;
    let encWrappedKey: Buffer | null = null;
    let encWrapIv: Buffer | null = null;
    let encWrapTag: Buffer | null = null;
    let encDataKeyForClient: string | null = null;

    if (encrypt) {
      const mk = getActiveMasterKey();
      if (!mk) {
        return NextResponse.json(
          {
            ok: false,
            error: "ENCRYPTION_NOT_CONFIGURED",
            message: "Server encryption is not configured.",
          },
          { status: 500 }
        );
      }
      const dataKey = generateDataKey();
      const wrap = wrapDataKey({ dataKey, masterKey: mk.key });
      encryptionEnabled = true;
      encAlg = "AES-256-GCM";
      encIv = generateIv();
      encKeyVersion = mk.id;
      encWrappedKey = wrap.wrapped;
      encWrapIv = wrap.iv;
      encWrapTag = wrap.tag;
      encDataKeyForClient = dataKey.toString("base64");
    }

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
        ${encryptionEnabled},
        ${encAlg},
        ${encIv},
        ${encKeyVersion},
        ${encWrappedKey},
        ${encWrapIv},
        ${encWrapTag}
      )
    `;

    const expiresIn = 10 * 60;

    const putParams: any = {
      Bucket: r2Bucket,
      Key: key,
      ContentType: encrypt ? "application/octet-stream" : "application/pdf",
    };

    // IMPORTANT (recommended path):
    // Do NOT include ServerSideEncryption or checksum-related headers in browser presigned PUTs.
    // If these headers are signed, the browser must send them exactly, otherwise R2 returns
    // SignatureDoesNotMatch (403). R2 encrypts at rest by default.

    const uploadUrl = await getSignedUrl(r2Client, new PutObjectCommand(putParams), { expiresIn });

    return NextResponse.json({
      ok: true,
      doc_id: docId,
      upload_url: uploadUrl,
      r2_key: key,
      bucket: r2Bucket,
      expires_in: expiresIn,
      encryption: encryptionEnabled
        ? { enabled: true, alg: encAlg, iv_b64: encIv?.toString("base64"), data_key_b64: encDataKeyForClient }
        : { enabled: false },
    });
  } catch (err: any) {
    console.error("PRESIGN ERROR:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "SERVER_ERROR",
        message: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}
