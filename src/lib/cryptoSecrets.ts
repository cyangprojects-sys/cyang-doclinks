// src/lib/cryptoSecrets.ts
// Minimal AES-256-GCM helper for encrypting per-tenant OIDC client secrets at rest.
// Format: v1:<base64(iv)>:<base64(tag)>:<base64(ciphertext)>

import crypto from "crypto";

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
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("OIDC_SECRETS_KEY must be base64 for exactly 32 bytes (AES-256-GCM).");
  }
  return buf;
}

export function encryptSecret(plaintext: string): string {
  const key = getKeyBytes();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  const key = getKeyBytes();
  const raw = String(stored || "").trim();
  const m = raw.match(/^v1:([^:]+):([^:]+):(.+)$/);
  if (!m) {
    throw new Error("Invalid encrypted secret format (expected v1:iv:tag:ciphertext).");
  }
  const iv = Buffer.from(m[1], "base64");
  const tag = Buffer.from(m[2], "base64");
  const ct = Buffer.from(m[3], "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}
