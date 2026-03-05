// src/lib/deviceTrust.ts
// Device-trust ("remember this device") helpers.
//
// For alias-password links we intentionally avoid a DB table so it works in any
// environment without migrations. We store a signed payload in an HttpOnly cookie
// that expires after N hours.

import crypto from "crypto";
import { signPayload, verifySignedPayload } from "@/lib/crypto";

export const DEVICE_TRUST_HOURS = 8;
const MAX_ALIAS_LEN = 160;
const MAX_TRUST_WINDOW_MS = DEVICE_TRUST_HOURS * 60 * 60 * 1000;

type AliasTrustPayload = {
  v: 1;
  alias: string;
  exp: number; // epoch ms
};

function normAlias(alias: string): string {
  const raw = String(alias || "").trim();
  if (!raw) return "";
  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();
  const out = decoded.trim().toLowerCase();
  if (!out || out.length > MAX_ALIAS_LEN || /[\r\n\0]/.test(out)) return "";
  return out;
}

function aliasKey(alias: string): string {
  // Cookie names are size-limited; hash the alias so any characters are safe.
  const normalized = normAlias(alias);
  const fallback = String(alias || "").trim().toLowerCase().replace(/[\r\n\0]/g, "").slice(0, MAX_ALIAS_LEN);
  const keyMaterial = normalized || fallback || "invalid";
  return crypto.createHash("sha256").update(keyMaterial).digest("hex").slice(0, 24);
}

export function aliasTrustCookieName(alias: string): string {
    return `alias_trust_${aliasKey(alias)}`;
}

export function makeAliasTrustCookieValue(alias: string, expMs: number): string {
  const safeAlias = normAlias(alias);
  if (!safeAlias) throw new Error("INVALID_ALIAS");
  if (!Number.isFinite(expMs)) throw new Error("INVALID_EXPIRY");

  const now = Date.now();
  const exp = Math.floor(expMs);
  if (exp <= now || exp > now + MAX_TRUST_WINDOW_MS * 2) throw new Error("INVALID_EXPIRY");

  const payload: AliasTrustPayload = {
    v: 1,
    alias: safeAlias,
    exp,
  };
  return signPayload(payload);
}

export function isAliasTrusted(alias: string, cookieValue: string | null | undefined): boolean {
    const v = String(cookieValue || "");
    if (!v) return false;

    const payload = verifySignedPayload<AliasTrustPayload>(v);
    if (!payload) return false;
    if (payload.v !== 1) return false;

    const a = normAlias(alias);
    if (!a) return false;
    if (payload.alias !== a) return false;

    if (!Number.isFinite(payload.exp)) return false;
    if (payload.exp <= Date.now()) return false;
    if (payload.exp > Date.now() + MAX_TRUST_WINDOW_MS * 2) return false;
    return true;
}
