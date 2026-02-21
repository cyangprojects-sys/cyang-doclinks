// src/lib/geo.ts

import { sql } from "@/lib/db";

export function getCountryFromHeaders(headers: Headers): string | null {
  const v =
    (headers.get("x-vercel-ip-country") || "").trim() ||
    (headers.get("cf-ipcountry") || "").trim();
  if (!v) return null;
  const c = v.toUpperCase();
  // Cloudflare uses "XX" when unknown.
  if (c === "XX") return null;
  if (!/^[A-Z]{2}$/.test(c)) return null;
  return c;
}

function normList(list: any): string[] {
  if (!Array.isArray(list)) return [];
  return list.map((x) => String(x || "").trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x));
}

export function isCountryAllowed(args: {
  country: string | null;
  allowedCountries?: any;
  blockedCountries?: any;
}): boolean {
  const country = args.country;
  if (!country) return true; // unknown => allow (best-effort)

  const allowed = normList(args.allowedCountries);
  const blocked = normList(args.blockedCountries);

  if (blocked.includes(country)) return false;
  if (allowed.length > 0 && !allowed.includes(country)) return false;
  return true;
}

export async function geoDecisionForRequest(args: {
  country: string | null;
  docId: string;
  token?: string | null;
}): Promise<{ allowed: boolean; reason?: string }> {
  const { country, docId, token } = args;

  // 1) Share-level policy (if available)
  if (token) {
    try {
      const rows = (await sql`
        select allowed_countries, blocked_countries
        from public.share_tokens
        where token = ${token}
        limit 1
      `) as any[];
      const r = rows?.[0];
      if (r) {
        const ok = isCountryAllowed({ country, allowedCountries: r.allowed_countries, blockedCountries: r.blocked_countries });
        if (!ok) return { allowed: false, reason: "SHARE_GEO_BLOCK" };
      }
    } catch {
      // columns/table may not exist yet
    }
  }

  // 2) Doc-level policy (if available)
  try {
    const rows = (await sql`
      select allowed_countries, blocked_countries
      from public.docs
      where id = ${docId}::uuid
      limit 1
    `) as any[];
    const r = rows?.[0];
    if (r) {
      const ok = isCountryAllowed({ country, allowedCountries: r.allowed_countries, blockedCountries: r.blocked_countries });
      if (!ok) return { allowed: false, reason: "DOC_GEO_BLOCK" };
    }
  } catch {
    // columns may not exist yet
  }

  return { allowed: true };
}
