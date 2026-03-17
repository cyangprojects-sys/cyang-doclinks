import { getDmcaEmailEnv, getSecurityEmailEnv, getSupportEmailEnv } from "@/lib/envConfig";

const MAX_EMAIL_LEN = 320;

function normEmail(v: string | null | undefined): string | null {
  const s = String(v || "").trim().toLowerCase().slice(0, MAX_EMAIL_LEN);
  if (!s) return null;
  if (/[\r\n]/.test(s)) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return s;
}

export function getSupportEmail(): string {
  return normEmail(getSupportEmailEnv()) || "support@cyang.io";
}

export function getDmcaEmail(): string {
  return normEmail(getDmcaEmailEnv()) || getSupportEmail();
}

export function getPrivacyEmail(): string {
  return normEmail(process.env.PRIVACY_EMAIL) || getSupportEmail();
}

export function getSecurityEmail(): string {
  return normEmail(getSecurityEmailEnv()) || getSupportEmail();
}
