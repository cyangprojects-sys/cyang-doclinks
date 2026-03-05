// src/lib/apiKeys.ts
import crypto from "crypto";

const MAX_API_KEY_INPUT_LEN = 512;

export type ApiKeyRecord = {
  id: string;
  owner_id: string;
  name: string;
  prefix: string;
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
};

function normSecretSalt(): string {
  const salt = (process.env.API_KEY_SALT || process.env.NEXTAUTH_SECRET || process.env.VIEW_SALT || "").trim();
  if (!salt) throw new Error("Missing API_KEY_SALT (or NEXTAUTH_SECRET/VIEW_SALT fallback)");
  return salt;
}

export function generateApiKey(): { plaintext: string; prefix: string } {
  // Format: cyk_<prefix>_<random>
  const prefix = crypto.randomBytes(4).toString("hex"); // 8 chars
  const rand = crypto.randomBytes(24).toString("base64url"); // ~32 chars
  const plaintext = `cyk_${prefix}_${rand}`;
  return { plaintext, prefix: `cyk_${prefix}` };
}

export function hashApiKey(plaintext: string): string {
  const salt = normSecretSalt();
  const key = String(plaintext || "").trim().slice(0, MAX_API_KEY_INPUT_LEN);
  return crypto.createHmac("sha256", salt).update(key).digest("hex");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const aa = String(a || "").slice(0, MAX_API_KEY_INPUT_LEN);
  const bbIn = String(b || "").slice(0, MAX_API_KEY_INPUT_LEN);
  const ab = Buffer.from(aa, "utf8");
  const bb = Buffer.from(bbIn, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
