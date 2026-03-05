import { createHash } from "node:crypto";
import { getTrustedClientIpFromHeaders } from "@/lib/clientIp";

const MAX_IP_INPUT_LEN = 64;
const MAX_SALT_LEN = 256;

function normalizedHashInput(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.length > MAX_IP_INPUT_LEN) return null;
  if (/[\r\n\0]/.test(raw)) return null;
  return raw;
}

function resolveViewSalt(): string {
  const candidates = [process.env.VIEW_SALT, process.env.NEXTAUTH_SECRET, process.env.APP_SECRET];
  for (const candidate of candidates) {
    const raw = String(candidate || "").trim();
    if (!raw || /[\r\n\0]/.test(raw)) continue;
    return raw.slice(0, MAX_SALT_LEN);
  }
  return "dev-salt-change-me";
}

export function hashIp(ip: string | null | undefined) {
    const safeIp = normalizedHashInput(ip);
    if (!safeIp) return null;
    const salt = resolveViewSalt();
    return createHash("sha256").update(`${salt}:${safeIp}`).digest("hex");
}

export function getClientIp(req: Request) {
    return getTrustedClientIpFromHeaders(req.headers);
}
