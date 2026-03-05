// src/lib/cryptoSecrets.ts
// Minimal AES-256-GCM helper for encrypting per-tenant OIDC client secrets at rest.
// Format: v1:<base64(iv)>:<base64(tag)>:<base64(ciphertext)>

import crypto from "crypto";

const AES_KEY_BYTES = 32;
const AES_GCM_IV_BYTES = 12;
const AES_GCM_TAG_BYTES = 16;
const MAX_SECRET_TEXT_BYTES = 16 * 1024;
const MAX_STORED_SECRET_LEN = 96 * 1024;
const BASE64_RE = /^(?:[A-Za-z0-9+/]+={0,2})$/;

function decodeBase64Strict(value: string, label: string): Buffer {
  const raw = String(value || "").trim();
  if (!raw || raw.length > MAX_STORED_SECRET_LEN || !BASE64_RE.test(raw) || raw.length % 4 !== 0) {
    throw new Error(`Invalid ${label} encoding.`);
  }
  const decoded = Buffer.from(raw, "base64");
  if (!decoded.length) throw new Error(`Invalid ${label} encoding.`);
  return decoded;
}

function getKeyBytes(): Buffer {
  const raw = (process.env.OIDC_SECRETS_KEY || "").trim();
  if (!raw) {
    throw new Error(
      [
        "Missing OIDC_SECRETS_KEY.",
        "Generate a 32-byte base64 key, e.g.:",
        "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\".",
      ].join(" ")
    );
  }
  const buf = decodeBase64Strict(raw, "OIDC_SECRETS_KEY");
  if (buf.length !== AES_KEY_BYTES) {
    throw new Error("OIDC_SECRETS_KEY must be base64 for exactly 32 bytes (AES-256-GCM).");
  }
  return buf;
}

export function encryptSecret(plaintext: string): string {
  const message = String(plaintext ?? "");
  const messageBytes = Buffer.byteLength(message, "utf8");
  if (messageBytes === 0 || messageBytes > MAX_SECRET_TEXT_BYTES) {
    throw new Error("Secret must be between 1 and 16384 UTF-8 bytes.");
  }

  const key = getKeyBytes();
  const iv = crypto.randomBytes(AES_GCM_IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(message, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  const key = getKeyBytes();
  const raw = String(stored || "").trim();
  if (!raw || raw.length > MAX_STORED_SECRET_LEN || /[\r\n\0]/.test(raw)) {
    throw new Error("Invalid encrypted secret format (expected v1:iv:tag:ciphertext).");
  }
  const m = raw.match(/^v1:([^:]+):([^:]+):(.+)$/);
  if (!m) {
    throw new Error("Invalid encrypted secret format (expected v1:iv:tag:ciphertext).");
  }
  const iv = decodeBase64Strict(m[1], "iv");
  const tag = decodeBase64Strict(m[2], "tag");
  const ct = decodeBase64Strict(m[3], "ciphertext");
  if (iv.length !== AES_GCM_IV_BYTES || tag.length !== AES_GCM_TAG_BYTES) {
    throw new Error("Invalid encrypted secret format (expected v1:iv:tag:ciphertext).");
  }
  if (!ct.length || ct.length > MAX_SECRET_TEXT_BYTES * 2) {
    throw new Error("Invalid encrypted secret format (expected v1:iv:tag:ciphertext).");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}
