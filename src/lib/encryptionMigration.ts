import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { sql } from "@/lib/db";
import { getR2Bucket, r2Client } from "@/lib/r2";
import { encryptAes256Gcm, generateDataKey, generateIv, wrapDataKey } from "@/lib/encryption";
import { getActiveMasterKeyOrThrow } from "@/lib/masterKeys";
import { appendImmutableAudit } from "@/lib/immutableAudit";

type LegacyDoc = {
  id: string;
  r2_bucket: string | null;
  r2_key: string | null;
  content_type: string | null;
  size_bytes: number | string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_BATCH_LIMIT = 25;
const MAX_BATCH_LIMIT = 250;
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;
const MIN_MAX_BYTES = 1024 * 1024;
const HARD_MAX_MIGRATION_BYTES = 512 * 1024 * 1024;
const MAX_R2_KEY_LEN = 1024;
const MAX_ERROR_LEN = 240;

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(raw)));
}

function sanitizeError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.replace(/[\r\n\0]+/g, " ").trim().slice(0, MAX_ERROR_LEN) || "UNKNOWN_ERROR";
}

async function streamToBuffer(body: unknown, maxBytes: number): Promise<Buffer> {
  if (!body || typeof (body as AsyncIterable<unknown>)[Symbol.asyncIterator] !== "function") {
    return Buffer.alloc(0);
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body as AsyncIterable<unknown>) {
    if (Buffer.isBuffer(chunk)) {
      total += chunk.length;
      if (total > maxBytes) throw new Error("STREAM_TOO_LARGE");
      chunks.push(chunk);
      continue;
    }
    if (chunk instanceof Uint8Array) {
      const out = Buffer.from(chunk);
      total += out.length;
      if (total > maxBytes) throw new Error("STREAM_TOO_LARGE");
      chunks.push(out);
      continue;
    }
    if (typeof chunk === "string") {
      const out = Buffer.from(chunk);
      total += out.length;
      if (total > maxBytes) throw new Error("STREAM_TOO_LARGE");
      chunks.push(out);
      continue;
    }
    if (chunk instanceof ArrayBuffer) {
      const out = Buffer.from(new Uint8Array(chunk));
      total += out.length;
      if (total > maxBytes) throw new Error("STREAM_TOO_LARGE");
      chunks.push(out);
      continue;
    }
    throw new Error("UNSUPPORTED_STREAM_CHUNK");
  }
  return Buffer.concat(chunks);
}

export async function migrateLegacyEncryptionBatch(args: {
  limit: number;
  dryRun?: boolean;
  maxBytes?: number;
  actorUserId?: string | null;
  orgId?: string | null;
}) {
  const r2Bucket = getR2Bucket();
  const limit = clampInt(args.limit, DEFAULT_BATCH_LIMIT, 1, MAX_BATCH_LIMIT);
  const dryRun = Boolean(args.dryRun);
  const maxBytesRaw = args.maxBytes ?? process.env.LEGACY_MIGRATION_MAX_BYTES ?? DEFAULT_MAX_BYTES;
  const maxBytes = clampInt(maxBytesRaw, DEFAULT_MAX_BYTES, MIN_MAX_BYTES, HARD_MAX_MIGRATION_BYTES);

  const rows = (await sql`
    select
      d.id::text as id,
      d.r2_bucket::text as r2_bucket,
      d.r2_key::text as r2_key,
      d.content_type::text as content_type,
      d.size_bytes::bigint as size_bytes
    from public.docs d
    where coalesce(d.encryption_enabled, false) = false
      and coalesce(d.status::text, '') in ('ready', 'uploading')
      and d.r2_key is not null
    order by d.created_at asc
    limit ${limit}
  `) as unknown as LegacyDoc[];

  if (!rows.length) return { scanned: 0, migrated: 0, skipped: 0, failed: 0, errors: [] as Array<{ docId: string; error: string }> };

  const mk = dryRun ? null : await getActiveMasterKeyOrThrow();

  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  const errors: Array<{ docId: string; error: string }> = [];

  for (const row of rows) {
    const docId = String(row.id || "").trim();
    const bucket = row.r2_bucket || r2Bucket;
    const key = String(row.r2_key || "").trim();
    if (!UUID_RE.test(docId) || !key || key.length > MAX_R2_KEY_LEN || bucket !== r2Bucket) {
      skipped += 1;
      continue;
    }

    try {
      const size = Number(row.size_bytes ?? 0);
      if (Number.isFinite(size) && size > maxBytes) {
        skipped += 1;
        continue;
      }

      if (dryRun) {
        migrated += 1;
        continue;
      }

      const getObj = await r2Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const plaintext = await streamToBuffer((getObj as { Body?: unknown }).Body, maxBytes);
      if (!plaintext.length || plaintext.length > maxBytes) {
        throw new Error("INVALID_SIZE");
      }

      const dataKey = generateDataKey();
      const iv = generateIv();
      const wrap = wrapDataKey({ dataKey, masterKey: mk!.key });
      const ciphertext = encryptAes256Gcm({ plaintext, iv, key: dataKey });

      await r2Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: ciphertext,
          ContentType: "application/octet-stream",
          Metadata: {
            "doc-id": docId,
            "orig-content-type": row.content_type || "application/pdf",
          },
        })
      );

      await sql`
        update public.docs
        set
          encryption_enabled = true,
          enc_alg = 'AES-256-GCM',
          enc_iv = ${iv},
          enc_key_version = ${mk!.id},
          enc_wrapped_key = ${wrap.wrapped},
          enc_wrap_iv = ${wrap.iv},
          enc_wrap_tag = ${wrap.tag}
        where id = ${docId}::uuid
      `;

      await appendImmutableAudit({
        streamKey: `doc:${docId}`,
        action: "doc.migrate_legacy_encryption",
        actorUserId: args.actorUserId ?? null,
        orgId: args.orgId ?? null,
        docId,
        payload: { keyVersion: mk!.id, plaintextBytes: plaintext.length },
      });

      migrated += 1;
    } catch (e: unknown) {
      const msg = sanitizeError(e);
      failed += 1;
      errors.push({ docId, error: msg });
    }
  }

  return {
    scanned: rows.length,
    migrated,
    skipped,
    failed,
    errors,
  };
}
