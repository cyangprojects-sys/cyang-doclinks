export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { validatePdfInR2 } from "@/lib/pdfSafety";
import { sql } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { requireDocWrite } from "@/lib/authz";
import { incrementUploads } from "@/lib/monetization";
import { enforceGlobalApiRateLimit, clientIpKey, logSecurityEvent, detectStorageSpike } from "@/lib/securityTelemetry";
import { r2Client, r2Bucket } from "@/lib/r2";

type CompleteRequest = {
  // Newer flow: doc_id from /presign response
  doc_id?: string;

  // Older flow (what your Network screenshot shows right now)
  r2_bucket?: string;
  r2_key?: string;

  title?: string | null;
  original_filename?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    // Global API throttle (best-effort)
    const globalRl = await enforceGlobalApiRateLimit({
      req,
      scope: "ip:api",
      limit: Number(process.env.RATE_LIMIT_API_IP_PER_MIN || 240),
      windowSeconds: 60,
    });
    if (!globalRl.ok) {
      return NextResponse.json(
        { ok: false, error: "RATE_LIMIT" },
        { status: globalRl.status, headers: { "Retry-After": String(globalRl.retryAfterSeconds) } }
      );
    }

    // Upload complete throttle per-IP
    const ipInfo = clientIpKey(req);
    const completeRl = await enforceGlobalApiRateLimit({
      req,
      scope: "ip:upload_complete",
      limit: Number(process.env.RATE_LIMIT_UPLOAD_COMPLETE_IP_PER_MIN || 30),
      windowSeconds: 60,
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
        r2_bucket::text as r2_bucket,
        r2_key::text as r2_key
      from public.docs
      where id = ${docId}::uuid
      limit 1
    `) as { id: string; name: string; r2_bucket: string | null; r2_key: string | null }[];

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

    // 3) Verify the object exists in R2 and matches expected constraints.
    // This closes the bypass where a client can lie about size/type during presign.
    const absMax = Number(process.env.UPLOAD_ABSOLUTE_MAX_BYTES || 1_000_000_000); // ~1GB default

    // Pull expected size and encryption flag from DB.
    const verifyRows = (await sql`
      select
        size_bytes::bigint as size_bytes,
        encryption_enabled::boolean as encryption_enabled
      from public.docs
      where id = ${docId}::uuid
      limit 1
    `) as unknown as Array<{ size_bytes: number | string | null; encryption_enabled: boolean | null }>;

    const expectedPlain = Number(verifyRows?.[0]?.size_bytes ?? 0);
    const encryptionEnabled = Boolean(verifyRows?.[0]?.encryption_enabled);

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
      return NextResponse.json({ ok: false, error: "object_too_large" }, { status: 413 });
    }

    // If encryption is enabled, the uploaded ciphertext includes a 16-byte GCM tag appended.
    // Some clients may also send unencrypted bytes in the future; accept exact match as well.
    if (Number.isFinite(expectedPlain) && expectedPlain > 0) {
      const allowedSizes = new Set<number>([expectedPlain, expectedPlain + 16]);
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
        return NextResponse.json({ ok: false, error: "size_mismatch" }, { status: 409 });
      }
    }

    // Verify signed metadata we attached during presign.
    const metaDocId = (meta["doc-id"] || meta["doc_id"] || "").toString();
    const metaOrigCt = (meta["orig-content-type"] || meta["orig_content_type"] || "").toString();

    if (metaDocId && metaDocId !== docId) {
      await logSecurityEvent({
        type: "upload_complete_meta_mismatch",
        severity: "high",
        ip: ipInfo.ip,
        docId,
        scope: "upload_complete",
        message: "R2 object metadata doc-id mismatch",
        meta: { metaDocId, docId },
      });
      return NextResponse.json({ ok: false, error: "metadata_mismatch" }, { status: 409 });
    }

    // If present, require original to be PDF.
    if (metaOrigCt && metaOrigCt !== "application/pdf") {
      await logSecurityEvent({
        type: "upload_complete_not_pdf",
        severity: "high",
        ip: ipInfo.ip,
        docId,
        scope: "upload_complete",
        message: "R2 metadata orig-content-type is not application/pdf",
        meta: { metaOrigCt, ct },
      });
      return NextResponse.json({ ok: false, error: "not_pdf" }, { status: 409 });
    }

    
    // 4) Lightweight PDF safety validation (unencrypted only).
    // If encryption is enabled, server cannot cheaply validate magic bytes without downloading & decrypting the full object.
    // In that case, we mark scan_status as skipped_encrypted.
    let scanStatus: string = "unscanned";
    let riskLevel: string = "low";
    let riskFlags: any = null;

    if (!encryptionEnabled) {
      const safety = await validatePdfInR2({
        bucket: docBucket,
        key: docKey,
        sampleBytes: Number(process.env.PDF_SAFETY_SAMPLE_BYTES || 262144),
        absMaxBytes: absMax,
      });

      if (!safety.ok) {
        await logSecurityEvent({
          type: "upload_complete_pdf_validation_failed",
          severity: "high",
          ip: ipInfo.ip,
          docId,
          scope: "upload_complete",
          message: "PDF validation failed",
          meta: { error: safety.error, message: safety.message, details: safety.details ?? null },
        });
        return NextResponse.json({ ok: false, error: safety.error, message: safety.message }, { status: 409 });
      }

      scanStatus = safety.riskLevel === "low" ? "clean" : "risky";
      riskLevel = safety.riskLevel;
      riskFlags = { flags: safety.flags, details: safety.details };
    } else {
      scanStatus = "skipped_encrypted";
      riskLevel = "low";
      riskFlags = { flags: ["encrypted:skipped_validation"] };
    }

// 4) Mark doc ready + update metadata (best-effort)
    await sql`
      update public.docs
      set
        title = coalesce(${title}, title),
        original_filename = coalesce(${originalFilename}, original_filename),
        status = 'ready',
        scan_status = ${scanStatus}::text,
        risk_level = ${riskLevel}::text,
        risk_flags = ${riskFlags}::jsonb,
        moderation_status = coalesce(moderation_status, 'active')
      where id = ${docId}::uuid
    `;

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

    return NextResponse.json({
      ok: true,
      doc_id: docId,
      alias: finalAlias,
      view_url: `${baseUrl}/d/${encodeURIComponent(finalAlias)}`,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", message: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
