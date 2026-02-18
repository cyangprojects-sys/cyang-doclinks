// src/lib/deviceTrust.ts
// Device-trust ("remember this device") helpers.
//
// For alias-password links we intentionally avoid a DB table so it works in any
// environment without migrations. We store a signed payload in an HttpOnly cookie
// that expires after N hours.

import crypto from "crypto";
import { signPayload, verifySignedPayload } from "@/lib/crypto";

export const DEVICE_TRUST_HOURS = 8;

type AliasTrustPayload = {
    v: 1;
    alias: string;
    exp: number; // epoch ms
};

function normAlias(alias: string): string {
    return decodeURIComponent(String(alias || "")).trim().toLowerCase();
}

function aliasKey(alias: string): string {
    // Cookie names are size-limited; hash the alias so any characters are safe.
    const a = normAlias(alias);
    return crypto.createHash("sha256").update(a).digest("hex").slice(0, 24);
}

export function aliasTrustCookieName(alias: string): string {
    return `alias_trust_${aliasKey(alias)}`;
}

export function makeAliasTrustCookieValue(alias: string, expMs: number): string {
    const payload: AliasTrustPayload = {
        v: 1,
        alias: normAlias(alias),
        exp: expMs,
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

    return Number.isFinite(payload.exp) && payload.exp > Date.now();
}
