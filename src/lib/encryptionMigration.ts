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

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body || typeof (body as AsyncIterable<unknown>)[Symbol.asyncIterator] !== "function") {
    return Buffer.alloc(0);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<unknown>) {
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk);
      continue;
    }
    if (chunk instanceof Uint8Array) {
      chunks.push(Buffer.from(chunk));
      continue;
    }
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
      continue;
    }
    if (chunk instanceof ArrayBuffer) {
      chunks.push(Buffer.from(new Uint8Array(chunk)));
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
  const limit = Math.max(1, Math.min(250, Math.floor(args.limit || 25)));
  const dryRun = Boolean(args.dryRun);
  const maxBytes = Math.max(
    1024 * 1024,
    Number(args.maxBytes || process.env.LEGACY_MIGRATION_MAX_BYTES || 100 * 1024 * 1024)
  );

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
    const docId = row.id;
    const bucket = row.r2_bucket || r2Bucket;
    const key = row.r2_key || "";
    if (!key || bucket !== r2Bucket) {
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
      const plaintext = await streamToBuffer((getObj as { Body?: unknown }).Body);
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
      const msg = e instanceof Error ? e.message : String(e);
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
