import crypto from "crypto";

/**
 * Document encryption helpers used by:
 * - /api/admin/upload/presign (client-side encrypt + upload)
 * - /t/[ticketId] (server-side decrypt for signed URL flow)
 *
 * Master key configuration:
 *   DOC_MASTER_KEYS='[{"id":"k1","key_b64":"...","active":true}]'
 *
 * Notes:
 * - Data key: 32 bytes (AES-256)
 * - IV: 12 bytes (recommended for GCM)
 * - Tags: 16 bytes
 */

type MasterKeyEnv = {
  id: string;
  key_b64: string;
  active?: boolean;
};

export type ActiveMasterKey = { id: string; key: Buffer };

function parseMasterKeys(): MasterKeyEnv[] {
  const raw = process.env.DOC_MASTER_KEYS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(Boolean) as MasterKeyEnv[];
  } catch {
    return [];
  }
}

export function getActiveMasterKey(): ActiveMasterKey {
  const keys = parseMasterKeys();
  if (!keys.length) {
    throw new Error("Missing DOC_MASTER_KEYS");
  }

  const active = keys.find((k) => k.active) ?? keys[0];
  const key = Buffer.from(active.key_b64, "base64");
  if (key.length !== 32) {
    throw new Error(`Invalid master key length for ${active.id} (expected 32 bytes)`);
  }
  return { id: active.id, key };
}

export function getMasterKeyById(id: string): ActiveMasterKey {
  const keys = parseMasterKeys();
  const found = keys.find((k) => k.id === id);
  if (!found) {
    throw new Error(`Unknown master key id: ${id}`);
  }
  const key = Buffer.from(found.key_b64, "base64");
  if (key.length !== 32) {
    throw new Error(`Invalid master key length for ${found.id} (expected 32 bytes)`);
  }
  return { id: found.id, key };
}

export function generateDataKey(): Buffer {
  return crypto.randomBytes(32);
}

export function generateIv(): Buffer {
  return crypto.randomBytes(12);
}

/**
 * Should the upload path force server-side encryption at rest for R2.
 * This is a toggle: encryption-at-rest is handled by the storage provider.
 */
export function shouldForceSse(): boolean {
  const v = (process.env.R2_FORCE_SSE ?? process.env.FORCE_R2_SSE ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Wrap (encrypt) a per-document data key using a master key.
 */
export function wrapDataKey(args: {
  dataKey: Buffer;
  masterKey: Buffer;
}): { wrapped: Buffer; iv: Buffer; tag: Buffer } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", args.masterKey, iv);
  const wrapped = Buffer.concat([cipher.update(args.dataKey), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { wrapped, iv, tag };
}

/**
 * Unwrap (decrypt) a per-document data key using a master key.
 */
export function unwrapDataKey(args: {
  wrapped: Buffer;
  wrapIv: Buffer;
  wrapTag: Buffer;
  masterKey: Buffer;
}): Buffer {
  const decipher = crypto.createDecipheriv("aes-256-gcm", args.masterKey, args.wrapIv);
  decipher.setAuthTag(args.wrapTag);
  return Buffer.concat([decipher.update(args.wrapped), decipher.final()]);
}

/**
 * Decrypt AES-256-GCM ciphertext.
 *
 * If ciphertext includes the auth tag appended (common pattern), we split
 * the last 16 bytes automatically. If a caller provides separate tag in the
 * future, this can be extended.
 */
export function decryptAes256Gcm(args: {
  ciphertext: Buffer;
  iv: Buffer;
  key: Buffer;
}): Buffer {
  const ct = args.ciphertext;
  if (ct.length < 16) throw new Error("Ciphertext too short");
  const tag = ct.subarray(ct.length - 16);
  const data = ct.subarray(0, ct.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", args.key, args.iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function encryptAes256Gcm(args: {
  plaintext: Buffer;
  iv: Buffer;
  key: Buffer;
}): Buffer {
  const cipher = crypto.createCipheriv("aes-256-gcm", args.key, args.iv);
  const out = Buffer.concat([cipher.update(args.plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([out, tag]);
}
