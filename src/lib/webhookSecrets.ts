import { decryptSecret, encryptSecret } from "@/lib/cryptoSecrets";

export function isEncryptedSecretFormat(value: string): boolean {
  return /^v1:[^:]+:[^:]+:.+$/.test(String(value || "").trim());
}

export function encryptWebhookSecretForStorage(secretRaw: string): string {
  const secret = String(secretRaw || "").trim();
  if (!secret) return "";
  return encryptSecret(secret);
}

export function decryptWebhookSecretForUse(stored: string | null): string | null {
  const raw = String(stored || "").trim();
  if (!raw) return null;
  if (!isEncryptedSecretFormat(raw)) return raw;
  return decryptSecret(raw);
}

