export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { validatePdfBuffer } from "@/lib/pdfSafety";
import { sql } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { requireDocWrite, requireUser } from "@/lib/authz";
import { getPlanForUser, incrementUploads } from "@/lib/monetization";
import { enforceGlobalApiRateLimit, clientIpKey, logDbErrorEvent, logSecurityEvent, detectStorageSpike } from "@/lib/securityTelemetry";
import { getR2Bucket, r2Client } from "@/lib/r2";
import { enqueueDocScan } from "@/lib/scanQueue";
import { encryptAes256Gcm, generateDataKey, generateIv, wrapDataKey } from "@/lib/encryption";
import { getActiveMasterKeyOrThrow } from "@/lib/masterKeys";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";
import { assertRuntimeEnv, isRuntimeEnvError } from "@/lib/runtimeEnv";
import { validateUploadType } from "@/lib/uploadTypeValidation";

type CompleteRequest = {
  // Newer flow: doc_id from /presign response
  doc_id?: string;

  // Older flow (what your Network screenshot shows right now)
  r2_bucket?: string;
  r2_key?: string;

  title?: string | null;
  original_filename?: string | null;
};

async function streamToBuffer(body: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of body as any) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function POST(req: NextRequest) {
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_UPLOAD_COMPLETE_MS", 45_000);
  try {
    return await withRouteTimeout(
      (async () => {
        assertRuntimeEnv("upload_complete");

        const r2Bucket = getR2Bucket();
        const user = await requireUser();
        const plan = await getPlanForUser(user.id);
        // Global API throttle (best-effort)
        const globalRl = await enforceGlobalApiRateLimit({
          req,
          scope: "ip:api",
          limit: Number(process.env.RATE_LIMIT_API_IP_PER_MIN || 240),
          windowSeconds: 60,
          strict: true,
        });
        if (!globalRl.ok) {
          return NextResponse.json(
            { ok: false, error: "RATE_LIMIT" },
            { status: globalRl.status, headers: { "Retry-After": String(globalRl.retryAfterSeconds) } }
          );
        }

        // Upload complete throttle per-IP
        const ipInfo = clientIpKey(req);
        const baseCompleteLimit = Number(process.env.RATE_LIMIT_UPLOAD_COMPLETE_IP_PER_MIN || 30);
        const freeCompleteLimit = Number(process.env.RATE_LIMIT_UPLOAD_COMPLETE_FREE_IP_PER_MIN || 12);
        const effectiveCompleteLimit =
          plan.id === "free"
            ? Math.max(1, Math.min(baseCompleteLimit, Number.isFinite(freeCompleteLimit) ? freeCompleteLimit : 12))
            : baseCompleteLimit;
        const completeRl = await enforceGlobalApiRateLimit({
          req,
          scope: "ip:upload_complete",
          limit: effectiveCompleteLimit,
          windowSeconds: 60,
          strict: true,
        });
        if (!completeRl.ok) {
          await logSecurityEvent({
            type: "upload_throttle",
            severity: "medium",
            ip: ipInfo.ip,
            scope: "ip:upload_complete",
            message: "Upload complete throttled",
          });
          return NextResponse.json(
            { ok: false, error: "RATE_LIMIT" },
            { status: completeRl.status, headers: { "Retry-After": String(completeRl.retryAfterSeconds) } }
          );
        }

    const body = (await req.json()) as CompleteRequest;

    const title = body.title ?? null;
    const originalFilename = body.original_filename ?? null;

    // 1) Resolve docId either directly or via (bucket,key)
    let docId: string | null = body.doc_id ?? null;

    if (!docId) {
      const bucket = body.r2_bucket ?? null;
      const key = body.r2_key ?? null;

      if (bucket && key) {
        const rows = (await sql`
          select id::text as id
          from public.docs
          where r2_bucket = ${bucket}
            and r2_key = ${key}
          limit 1
        `) as { id: string }[];

        docId = rows?.[0]?.id ?? null;
      }
    }

    if (!docId) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_doc_id",
          message: "Send doc_id (preferred) or r2_bucket + r2_key.",
        },
        { status: 400 }
      );
    }

    // AuthZ: must be able to manage this doc.
    await requireDocWrite(docId);

    // 2) Fetch existing doc (for slug fallback)
    const docRows = (await sql`
      select
        id::text as id,
        coalesce(original_filename, title, '')::text as name,
        coalesce(content_type, '')::text as content_type,
        r2_bucket::text as r2_bucket,
        r2_key::text as r2_key
      from public.docs
      where id = ${docId}::uuid
      limit 1
    `) as { id: string; name: string; content_type: string; r2_bucket: string | null; r2_key: string | null }[];

    if (!docRows.length) {
      return NextResponse.json({ ok: false, error: "doc_not_found" }, { status: 404 });
    }

    const existingName = docRows[0].name;

    const docBucket = docRows[0].r2_bucket;
    const docKey = docRows[0].r2_key;
    if (!docBucket || !docKey) {
      return NextResponse.json({ ok: false, error: "missing_r2_pointer" }, { status: 409 });
    }

    // Defensive: ensure this doc points at the configured bucket.
    // (Prevents any future cross-bucket pointer mistakes from becoming a data exfil path.)
    if (docBucket !== r2Bucket) {
      await logSecurityEvent({
        type: "upload_complete_bucket_mismatch",
        severity: "high",
        ip: ipInfo.ip,
        docId,
        scope: "upload_complete",
        message: "Doc bucket does not match configured R2 bucket",
        meta: { docBucket, configuredBucket: r2Bucket },
      });
      return NextResponse.json({ ok: false, error: "bucket_mismatch" }, { status: 409 });
    }

    const cleanupRejectedObject = async (reason: string, meta?: Record<string, unknown>) => {
      try {
        await r2Client.send(
          new DeleteObjectCommand({
            Bucket: docBucket,
            Key: docKey,
          })
        );
      } catch (e: any) {
        await logSecurityEvent({
          type: "upload_complete_cleanup_failed",
          severity: "high",
          ip: ipInfo.ip,
          docId,
          scope: "upload_complete",
          message: "Failed to delete rejected object from R2",
          meta: { reason, error: String(e?.message || e), ...(meta || {}) },
        });
      }
    };

    // 3) Verify the object exists in R2 and matches expected constraints.
    // This closes the bypass where a client can lie about size/type during presign.
    const absMax = Number(process.env.UPLOAD_ABSOLUTE_MAX_BYTES || 104_857_600); // 100 MB default

    // Pull expected size and encryption flag from DB.
    const verifyRows = (await sql`
      select
        size_bytes::bigint as size_bytes,
        encryption_enabled::boolean as encryption_enabled
      from public.docs
      where id = ${docId}::uuid
      limit 1
    `) as unknown as Array<{
      size_bytes: number | string | null;
      encryption_enabled: boolean | null;
    }>;

    const expectedPlain = Number(verifyRows?.[0]?.size_bytes ?? 0);
    const encryptionEnabled = Boolean(verifyRows?.[0]?.encryption_enabled);

    if (!encryptionEnabled) {
      await logSecurityEvent({
        type: "upload_complete_encryption_required",
        severity: "high",
        ip: ipInfo.ip,
        docId,
        scope: "upload_complete",
        message: "Upload completion blocked because encryption is not enabled for this doc",
      });
      await cleanupRejectedObject("encryption_required");
      return NextResponse.json({ ok: false, error: "encryption_required" }, { status: 409 });
    }

    let head;
    try {
      head = await r2Client.send(
        new HeadObjectCommand({
          Bucket: docBucket,
          Key: docKey,
        })
      );
    } catch (e: any) {
      await logSecurityEvent({
        type: "upload_complete_missing_object",
        severity: "high",
        ip: ipInfo.ip,
        docId,
        scope: "upload_complete",
        message: "Upload complete called but R2 object missing",
        meta: { err: e?.name ?? e?.message ?? String(e) },
      });
      return NextResponse.json({ ok: false, error: "object_missing" }, { status: 409 });
    }

    const contentLength = Number((head as any)?.ContentLength ?? 0);
    const ct = String((head as any)?.ContentType ?? "");
    const meta = ((head as any)?.Metadata ?? {}) as Record<string, string>;

    if (!Number.isFinite(contentLength) || contentLength <= 0) {
      await cleanupRejectedObject("invalid_object", { contentLength });
      return NextResponse.json({ ok: false, error: "invalid_object" }, { status: 409 });
    }
    if (Number.isFinite(absMax) && absMax > 0 && contentLength > absMax) {
      await logSecurityEvent({
        type: "upload_complete_too_large",
        severity: "high",
        ip: ipInfo.ip,
        docId,
        scope: "upload_complete",
        message: "Uploaded object exceeds absolute max",
        meta: { contentLength, absMax },
      });
      await cleanupRejectedObject("object_too_large", { contentLength, absMax });
      return NextResponse.json({ ok: false, error: "object_too_large" }, { status: 413 });
    }

    if (Number.isFinite(expectedPlain) && expectedPlain > 0) {
      const allowedSizes = new Set<number>([expectedPlain]);
      if (!allowedSizes.has(contentLength)) {
        await logSecurityEvent({
          type: "upload_complete_size_mismatch",
          severity: "high",
          ip: ipInfo.ip,
          docId,
          scope: "upload_complete",
          message: "Uploaded object size mismatch",
          meta: { expectedPlain, contentLength, encryptionEnabled },
        });
        await cleanupRejectedObject("size_mismatch", { expectedPlain, contentLength, encryptionEnabled });
        return NextResponse.json({ ok: false, error: "size_mismatch" }, { status: 409 });
      }
    }

    // Verify signed metadata we attached during presign.
    const metaDocId = (meta["doc-id"] || meta["doc_id"] || "").toString();
    const metaOrigCt = (meta["orig-content-type"] || meta["orig_content_type"] || "").toString();
    const metaOrigExt = (meta["orig-ext"] || meta["orig_ext"] || "").toString();

    if (!metaDocId) {
      await logSecurityEvent({
        type: "upload_complete_meta_missing_doc_id",
        severity: "high",
        ip: ipInfo.ip,
        docId,
        scope: "upload_complete",
        message: "R2 object metadata doc-id missing",
      });
      await cleanupRejectedObject("metadata_missing");
      return NextResponse.json({ ok: false, error: "metadata_missing" }, { status: 409 });
    }

    if (metaDocId !== docId) {
      await logSecurityEvent({
        type: "upload_complete_meta_mismatch",
        severity: "high",
        ip: ipInfo.ip,
        docId,
        scope: "upload_complete",
        message: "R2 object metadata doc-id mismatch",
        meta: { metaDocId, docId },
      });
      await cleanupRejectedObject("metadata_mismatch", { metaDocId, docId });
      return NextResponse.json({ ok: false, error: "metadata_mismatch" }, { status: 409 });
    }

    if (!metaOrigCt) {
      await logSecurityEvent({
        type: "upload_complete_mime_missing",
        severity: "high",
        ip: ipInfo.ip,
        docId,
        scope: "upload_complete",
        message: "R2 metadata orig-content-type is missing",
        meta: { metaOrigCt, ct, metaOrigExt },
      });
      await cleanupRejectedObject("mime_missing", { metaOrigCt, contentType: ct, metaOrigExt });
      return NextResponse.json({ ok: false, error: "mime_missing" }, { status: 409 });
    }

    if (ct && ct !== metaOrigCt) {
      await logSecurityEvent({
        type: "upload_complete_content_type_mismatch",
        severity: "high",
        ip: ipInfo.ip,
        docId,
        scope: "upload_complete",
        message: "Upload object content-type mismatch with declared metadata",
        meta: { contentType: ct, metaOrigCt },
      });
      await cleanupRejectedObject("content_type_mismatch", { encryptionEnabled: true, contentType: ct, metaOrigCt });
      return NextResponse.json({ ok: false, error: "content_type_mismatch" }, { status: 409 });
    }

    // 4) Read uploaded PDF bytes and validate server-side before encryption.
    let scanStatus: string = "pending";
    let riskLevel: string = "low";
    let riskFlags: any = null;
    let uploadedBytes: Buffer;
    try {
      const uploadedObj = await r2Client.send(
        new GetObjectCommand({
          Bucket: docBucket,
          Key: docKey,
        })
      );
      uploadedBytes = await streamToBuffer((uploadedObj as any).Body);
    } catch {
      await cleanupRejectedObject("object_read_failed");
      return NextResponse.json({ ok: false, error: "object_read_failed" }, { status: 409 });
    }

    const filenameForValidation = (originalFilename || docRows[0].name || "upload.bin").trim();
    const typeCheck = validateUploadType({
      filename: filenameForValidation,
      declaredMime: metaOrigCt || docRows[0].content_type || null,
      bytes: uploadedBytes,
    });
    if (!typeCheck.ok) {
      await logSecurityEvent({
        type: "upload_complete_type_validation_failed",
        severity: "high",
        ip: ipInfo.ip,
        docId,
        scope: "upload_complete",
        message: "File type validation failed before encryption",
        meta: { error: typeCheck.error, message: typeCheck.message, metaOrigCt, filenameForValidation },
      });
      await cleanupRejectedObject("type_validation_failed_before_encrypt", { error: typeCheck.error });
      return NextResponse.json({ ok: false, error: typeCheck.error, message: typeCheck.message }, { status: 409 });
    }

    if (typeCheck.canonicalMime === "application/pdf") {
      const safety = validatePdfBuffer({
        bytes: uploadedBytes,
        absMaxBytes: absMax,
        maxPdfPages: Number(process.env.PDF_MAX_PAGES || 2000),
      });
      if (!safety.ok) {
        await logSecurityEvent({
          type: "upload_complete_pdf_validation_failed",
          severity: "high",
          ip: ipInfo.ip,
          docId,
          scope: "upload_complete",
          message: "PDF validation failed before encryption",
          meta: { error: safety.error, message: safety.message, details: safety.details ?? null },
        });
        await cleanupRejectedObject("pdf_validation_failed_before_encrypt", { error: safety.error });
        return NextResponse.json({ ok: false, error: safety.error, message: safety.message }, { status: 409 });
      }
      scanStatus = "pending";
      riskLevel = safety.riskLevel;
      riskFlags = { flags: safety.flags, details: safety.details, mode: "server_validation" };
    } else {
      scanStatus = "pending";
      riskLevel = "low";
      riskFlags = { flags: [], details: { mime: typeCheck.canonicalMime, ext: typeCheck.ext }, mode: "server_validation" };
    }

    // 5) Encrypt file server-side and overwrite uploaded plaintext object.
    let encAlg = "AES-256-GCM";
    let encIv: Buffer | null = null;
    let encKeyVersion = "";
    let encWrappedKey: Buffer | null = null;
    let encWrapIv: Buffer | null = null;
    let encWrapTag: Buffer | null = null;
    try {
      const mk = await getActiveMasterKeyOrThrow();
      const dataKey = generateDataKey();
      encIv = generateIv();
      const wrap = wrapDataKey({ dataKey, masterKey: mk.key });
      const ciphertext = encryptAes256Gcm({ plaintext: uploadedBytes, iv: encIv, key: dataKey });
      await r2Client.send(
        new PutObjectCommand({
          Bucket: docBucket,
          Key: docKey,
          Body: ciphertext,
          ContentType: "application/octet-stream",
          Metadata: {
            "doc-id": docId,
            "orig-content-type": typeCheck.canonicalMime,
            "orig-ext": typeCheck.ext,
          },
        })
      );
      encKeyVersion = mk.id;
      encWrappedKey = wrap.wrapped;
      encWrapIv = wrap.iv;
      encWrapTag = wrap.tag;
    } catch {
      await cleanupRejectedObject("server_side_encrypt_failed");
      return NextResponse.json({ ok: false, error: "server_side_encrypt_failed" }, { status: 500 });
    }
    if (!encIv || !encKeyVersion || !encWrappedKey || !encWrapIv || !encWrapTag) {
      await cleanupRejectedObject("server_side_encrypt_metadata_missing");
      return NextResponse.json({ ok: false, error: "server_side_encrypt_metadata_missing" }, { status: 500 });
    }

// 6) Mark doc ready + update metadata (best-effort)
    await sql`
      update public.docs
      set
        title = coalesce(${title}, title),
        original_filename = coalesce(${originalFilename}, original_filename),
        content_type = ${typeCheck.canonicalMime},
        status = 'ready',
        scan_status = ${scanStatus}::text,
        risk_level = ${riskLevel}::text,
        risk_flags = ${riskFlags}::jsonb,
        enc_alg = ${encAlg},
        enc_iv = ${encIv},
        enc_key_version = ${encKeyVersion},
        enc_wrapped_key = ${encWrappedKey},
        enc_wrap_iv = ${encWrapIv},
        enc_wrap_tag = ${encWrapTag},
        moderation_status = case when ${riskLevel}::text = 'high' then 'quarantined' else coalesce(moderation_status, 'active') end
      where id = ${docId}::uuid
    `;



// 4b) Enqueue async malware scan (best-effort; runs via /api/cron/scan)
try {
  await enqueueDocScan({ docId, bucket: docBucket, key: docKey });
} catch (e: any) {
  // Non-fatal; upload is still usable unless other rules quarantine it.
  await logSecurityEvent({
    type: "malware_scan_enqueue_failed",
    severity: "medium",
    ip: ipInfo.ip,
    docId,
    scope: "upload_complete",
    message: "Failed to enqueue malware scan job",
    meta: { error: String(e?.message || e) },
  });
}
// --- Monetization counters (hidden) ---
// Count this as an upload for the doc owner (usually the signed-in user).
try {
  const usageRows = (await sql`
    select owner_id::text as owner_id
         , org_id::text as org_id
         , size_bytes::bigint as size_bytes
    from public.docs
    where id = ${docId}::uuid
    limit 1
  `) as unknown as Array<{ owner_id: string | null; org_id: string | null; size_bytes: number | string | null }>;
  const ownerId = usageRows?.[0]?.owner_id ?? null;
  const orgId = usageRows?.[0]?.org_id ?? null;
  const sizeBytes = Number(usageRows?.[0]?.size_bytes ?? 0);
  if (ownerId) {
    await incrementUploads(ownerId, 1);

    // Storage spike detection (best-effort)
    if (Number.isFinite(sizeBytes) && sizeBytes > 0) {
      await detectStorageSpike({ ownerId, sizeBytes, ip: ipInfo.ip, orgId, docId });
    }
  }
} catch (e) {
  // best-effort; do not block completion
  console.warn("Failed to increment upload usage:", e);
}


    // 4) Generate alias base
    let base = slugify(title || originalFilename || existingName || "document");
    if (!base) base = `doc-${docId.slice(0, 8)}`;

    // 5) Create alias with collision handling
    let finalAlias: string | null = null;

    for (let i = 0; i < 50; i++) {
      const candidateAlias = i === 0 ? base : `${base}-${i + 1}`;

      try {
        await sql`
          insert into public.doc_aliases (alias, doc_id)
          values (${candidateAlias}, ${docId}::uuid)
        `;
        finalAlias = candidateAlias;
        break;
      } catch {
        // alias collision, try next
      }
    }

    if (!finalAlias) {
      return NextResponse.json({ ok: false, error: "alias_generation_failed" }, { status: 500 });
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

        await logSecurityEvent({
          type: "upload_complete_success",
          severity: "low",
          ip: ipInfo.ip,
          scope: "upload_complete",
          message: "Upload finalized successfully",
          docId,
          meta: { sizeBytes: expectedPlain || null },
        });

        return NextResponse.json({
          ok: true,
          doc_id: docId,
          alias: finalAlias,
          view_url: `${baseUrl}/d/${encodeURIComponent(finalAlias)}`,
        });
      })(),
      timeoutMs
    );
  } catch (e: any) {
    if (isRuntimeEnvError(e)) {
      return NextResponse.json({ ok: false, error: "ENV_MISCONFIGURED" }, { status: 503 });
    }
    if (isRouteTimeoutError(e)) {
      await logSecurityEvent({
        type: "upload_complete_timeout",
        severity: "high",
        ip: clientIpKey(req).ip,
        scope: "upload_complete",
        message: "Upload completion exceeded timeout",
        meta: { timeoutMs },
      });
      return NextResponse.json({ ok: false, error: "TIMEOUT" }, { status: 504 });
    }
    await logDbErrorEvent({
      scope: "upload_complete",
      message: String(e?.message || e || "server_error"),
      ip: clientIpKey(req).ip,
      meta: { route: "/api/admin/upload/complete" },
    });
    return NextResponse.json(
      { ok: false, error: "server_error", message: "Unable to finalize upload." },
      { status: 500 }
    );
  }
}
