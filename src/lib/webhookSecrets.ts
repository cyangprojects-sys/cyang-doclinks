import { decryptSecret, encryptSecret } from "@/lib/cryptoSecrets";

const MAX_WEBHOOK_SECRET_LEN = 512;
const MAX_ENCRYPTED_SECRET_LEN = 4096;

function normalizeWebhookSecret(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.length > MAX_WEBHOOK_SECRET_LEN) return null;
  if (/[\r\n\0]/.test(raw)) return null;
  return raw;
}

export function isEncryptedSecretFormat(value: string): boolean {
  const raw = String(value || "").trim();
  if (!raw || raw.length > MAX_ENCRYPTED_SECRET_LEN || /[\r\n\0]/.test(raw)) return false;
  return /^v1:[^:]+:[^:]+:.+$/.test(raw);
}

export function encryptWebhookSecretForStorage(secretRaw: string): string {
  const secret = normalizeWebhookSecret(secretRaw);
  if (!secret) return "";
  return encryptSecret(secret);
}

export function decryptWebhookSecretForUse(stored: string | null): string | null {
  const raw = String(stored || "").trim();
  if (!raw) return null;
  if (!isEncryptedSecretFormat(raw)) {
    if (raw.toLowerCase().startsWith("v1:")) return null;
    return normalizeWebhookSecret(raw);
  }
  try {
    const secret = decryptSecret(raw);
    return normalizeWebhookSecret(secret);
  } catch {
    return null;
  }
}
