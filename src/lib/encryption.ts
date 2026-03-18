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

type MasterKeyValidation =
  | { ok: true; keys: MasterKeyEnv[] }
  | { ok: false; error: string };

const AES_KEY_BYTES = 32;
const AES_GCM_IV_BYTES = 12;
const AES_GCM_TAG_BYTES = 16;
const MAX_MASTER_KEYS_RAW_BYTES = 64 * 1024;
const MAX_MASTER_KEYS_COUNT = 32;
const MASTER_KEY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const BASE64_RE = /^(?:[A-Za-z0-9+/]+={0,2})$/;

function decodeBase64Strict(value: string): Buffer | null {
  const raw = String(value || "").trim();
  if (!raw || raw.length % 4 !== 0 || !BASE64_RE.test(raw)) return null;
  const out = Buffer.from(raw, "base64");
  return out.length ? out : null;
}

function parseMasterKeysFromRaw(raw: string | null | undefined): MasterKeyValidation {
  const input = String(raw || "").trim();
  if (!input) return { ok: true, keys: [] };
  if (input.length > MAX_MASTER_KEYS_RAW_BYTES || /[\0]/.test(input)) {
    return { ok: false, error: "DOC_MASTER_KEYS exceeds max allowed size." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return { ok: false, error: "DOC_MASTER_KEYS must be valid JSON." };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, error: "DOC_MASTER_KEYS must be a JSON array." };
  }
  if (parsed.length > MAX_MASTER_KEYS_COUNT) {
    return { ok: false, error: `DOC_MASTER_KEYS can contain at most ${MAX_MASTER_KEYS_COUNT} entries.` };
  }

  const keys: MasterKeyEnv[] = [];
  const ids = new Set<string>();
  let activeCount = 0;

  for (let i = 0; i < parsed.length; i += 1) {
    const row = parsed[i] as Record<string, unknown> | null;
    if (!row || typeof row !== "object") {
      return { ok: false, error: `DOC_MASTER_KEYS[${i}] must be an object.` };
    }

    const id = String(row.id || "").trim();
    const keyB64 = String(row.key_b64 || "").trim();
    const active = Boolean(row.active);

    if (!id) {
      return { ok: false, error: `DOC_MASTER_KEYS[${i}].id is required.` };
    }
    if (!MASTER_KEY_ID_RE.test(id)) {
      return { ok: false, error: `DOC_MASTER_KEYS[${i}].id has invalid format.` };
    }
    if (!keyB64) {
      return { ok: false, error: `DOC_MASTER_KEYS[${i}].key_b64 is required.` };
    }
    if (ids.has(id)) {
      return { ok: false, error: `DOC_MASTER_KEYS has duplicate id: ${id}` };
    }

    const keyBytes = decodeBase64Strict(keyB64);
    if (!keyBytes || keyBytes.length !== AES_KEY_BYTES) {
      return { ok: false, error: `Invalid master key length for ${id} (expected 32 bytes)` };
    }

    ids.add(id);
    if (active) activeCount += 1;
    keys.push({ id, key_b64: keyB64, active });
  }

  if (activeCount > 1) {
    return { ok: false, error: "DOC_MASTER_KEYS can only have one active key." };
  }

  return { ok: true, keys };
}

export function validateDocMasterKeysConfig(
  raw: string | null | undefined = process.env.DOC_MASTER_KEYS
): { ok: true } | { ok: false; error: string } {
  const parsed = parseMasterKeysFromRaw(raw);
  if (!parsed.ok) return parsed;
  return { ok: true };
}

function parseMasterKeys(): MasterKeyEnv[] {
  const parsed = parseMasterKeysFromRaw(process.env.DOC_MASTER_KEYS);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.keys;
}

export function getActiveMasterKey(): ActiveMasterKey {
  const keys = parseMasterKeys();
  if (!keys.length) {
    throw new Error("Missing DOC_MASTER_KEYS");
  }

  const active = keys.find((k) => k.active) ?? keys[0];
  const key = decodeBase64Strict(active.key_b64);
  if (!key || key.length !== AES_KEY_BYTES) {
    throw new Error(`Invalid master key length for ${active.id} (expected 32 bytes)`);
  }
  return { id: active.id, key };
}

export function getMasterKeyById(id: string): ActiveMasterKey {
  const keyId = String(id || "").trim();
  if (!MASTER_KEY_ID_RE.test(keyId)) {
    throw new Error("Unknown master key id");
  }
  const keys = parseMasterKeys();
  const found = keys.find((k) => k.id === keyId);
  if (!found) {
    throw new Error(`Unknown master key id: ${keyId}`);
  }
  const key = decodeBase64Strict(found.key_b64);
  if (!key || key.length !== AES_KEY_BYTES) {
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
 * Wrap (encrypt) a per-document data key using a master key.
 */
export function wrapDataKey(args: {
  dataKey: Buffer;
  masterKey: Buffer;
}): { wrapped: Buffer; iv: Buffer; tag: Buffer } {
  if (!Buffer.isBuffer(args.dataKey) || args.dataKey.length !== AES_KEY_BYTES) {
    throw new Error("Invalid data key");
  }
  if (!Buffer.isBuffer(args.masterKey) || args.masterKey.length !== AES_KEY_BYTES) {
    throw new Error("Invalid master key");
  }
  const iv = crypto.randomBytes(AES_GCM_IV_BYTES);
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
  if (!Buffer.isBuffer(args.wrapped) || args.wrapped.length !== AES_KEY_BYTES) {
    throw new Error("Invalid wrapped data key");
  }
  if (!Buffer.isBuffer(args.wrapIv) || args.wrapIv.length !== AES_GCM_IV_BYTES) {
    throw new Error("Invalid wrap IV");
  }
  if (!Buffer.isBuffer(args.wrapTag) || args.wrapTag.length !== AES_GCM_TAG_BYTES) {
    throw new Error("Invalid wrap tag");
  }
  if (!Buffer.isBuffer(args.masterKey) || args.masterKey.length !== AES_KEY_BYTES) {
    throw new Error("Invalid master key");
  }
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
  if (!Buffer.isBuffer(args.ciphertext) || args.ciphertext.length <= AES_GCM_TAG_BYTES) {
    throw new Error("Ciphertext too short");
  }
  if (!Buffer.isBuffer(args.iv) || args.iv.length !== AES_GCM_IV_BYTES) {
    throw new Error("Invalid IV length");
  }
  if (!Buffer.isBuffer(args.key) || args.key.length !== AES_KEY_BYTES) {
    throw new Error("Invalid key length");
  }
  const ct = args.ciphertext;
  const tag = ct.subarray(ct.length - AES_GCM_TAG_BYTES);
  const data = ct.subarray(0, ct.length - AES_GCM_TAG_BYTES);
  const decipher = crypto.createDecipheriv("aes-256-gcm", args.key, args.iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function encryptAes256Gcm(args: {
  plaintext: Buffer;
  iv: Buffer;
  key: Buffer;
}): Buffer {
  if (!Buffer.isBuffer(args.plaintext) || args.plaintext.length === 0) {
    throw new Error("Invalid plaintext");
  }
  if (!Buffer.isBuffer(args.iv) || args.iv.length !== AES_GCM_IV_BYTES) {
    throw new Error("Invalid IV length");
  }
  if (!Buffer.isBuffer(args.key) || args.key.length !== AES_KEY_BYTES) {
    throw new Error("Invalid key length");
  }
  const cipher = crypto.createCipheriv("aes-256-gcm", args.key, args.iv);
  const out = Buffer.concat([cipher.update(args.plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([out, tag]);
}
