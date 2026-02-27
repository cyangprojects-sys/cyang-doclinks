// src/lib/settings.ts
// DB-backed runtime settings (best-effort).
//
// Requires: public.app_settings (see scripts/sql/app_settings.sql)

import { sql } from "@/lib/db";

export type RetentionSettings = {
  enabled: boolean;
  deleteExpiredShares: boolean;
  shareGraceDays: number;
};

const DEFAULT_RETENTION: RetentionSettings = {
  enabled: true,
  deleteExpiredShares: true,
  shareGraceDays: 0,
};

export type ExpirationAlertSettings = {
  enabled: boolean;
  days: number; // threshold days (default 3)
  emailEnabled: boolean; // whether to send emails at all
};

const DEFAULT_EXPIRATION_ALERTS: ExpirationAlertSettings = {
  enabled: true,
  days: 3,
  emailEnabled: true,
};

function asBool(v: unknown, fallback: boolean) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes" || s === "y") return true;
    if (s === "false" || s === "0" || s === "no" || s === "n") return false;
  }
  if (typeof v === "number") return v !== 0;
  return fallback;
}

function asInt(v: unknown, fallback: number) {
  const n = typeof v === "number" ? v : Number(String(v ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

export async function getRetentionSettings(): Promise<
  | { ok: true; settings: RetentionSettings }
  | { ok: false; error: string }
> {
  try {
    const rows = (await sql`
      select value
      from public.app_settings
      where key = 'retention'
      limit 1
    `) as unknown as Array<{ value: any }>;

    const value = rows?.[0]?.value ?? null;
    if (!value || typeof value !== "object") {
      return { ok: true, settings: { ...DEFAULT_RETENTION } };
    }

    return {
      ok: true,
      settings: {
        enabled: asBool(value.enabled, DEFAULT_RETENTION.enabled),
        deleteExpiredShares: asBool(value.deleteExpiredShares, DEFAULT_RETENTION.deleteExpiredShares),
        shareGraceDays: Math.max(0, asInt(value.shareGraceDays, DEFAULT_RETENTION.shareGraceDays)),
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function setRetentionSettings(next: Partial<RetentionSettings>): Promise<
  | { ok: true; settings: RetentionSettings }
  | { ok: false; error: string }
> {
  // Read current (best-effort), then merge.
  const currentRes = await getRetentionSettings();
  const current = currentRes.ok ? currentRes.settings : { ...DEFAULT_RETENTION };

  const merged: RetentionSettings = {
    enabled: typeof next.enabled === "boolean" ? next.enabled : current.enabled,
    deleteExpiredShares:
      typeof next.deleteExpiredShares === "boolean" ? next.deleteExpiredShares : current.deleteExpiredShares,
    shareGraceDays:
      typeof next.shareGraceDays === "number" && Number.isFinite(next.shareGraceDays)
        ? Math.max(0, Math.floor(next.shareGraceDays))
        : current.shareGraceDays,
  };

  try {
    await sql`
      insert into public.app_settings (key, value)
      values ('retention', ${merged as any}::jsonb)
      on conflict (key) do update set value = excluded.value
    `;
    return { ok: true, settings: merged };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function getExpirationAlertSettings(): Promise<
  | { ok: true; settings: ExpirationAlertSettings }
  | { ok: false; error: string }
> {
  try {
    const rows = (await sql`
      select value
      from public.app_settings
      where key = 'expiration_alerts'
      limit 1
    `) as unknown as Array<{ value: any }>;

    const value = rows?.[0]?.value ?? null;
    if (!value || typeof value !== "object") {
      return { ok: true, settings: { ...DEFAULT_EXPIRATION_ALERTS } };
    }

    const days = Math.max(1, Math.min(30, asInt(value.days, DEFAULT_EXPIRATION_ALERTS.days)));

    return {
      ok: true,
      settings: {
        enabled: asBool(value.enabled, DEFAULT_EXPIRATION_ALERTS.enabled),
        days,
        emailEnabled: asBool(value.emailEnabled, DEFAULT_EXPIRATION_ALERTS.emailEnabled),
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function setExpirationAlertSettings(next: Partial<ExpirationAlertSettings>): Promise<
  | { ok: true; settings: ExpirationAlertSettings }
  | { ok: false; error: string }
> {
  const currentRes = await getExpirationAlertSettings();
  const current = currentRes.ok ? currentRes.settings : { ...DEFAULT_EXPIRATION_ALERTS };

  const merged: ExpirationAlertSettings = {
    enabled: typeof next.enabled === "boolean" ? next.enabled : current.enabled,
    emailEnabled: typeof next.emailEnabled === "boolean" ? next.emailEnabled : current.emailEnabled,
    days:
      typeof next.days === "number" && Number.isFinite(next.days)
        ? Math.max(1, Math.min(30, Math.floor(next.days)))
        : current.days,
  };

  try {
    await sql`
      insert into public.app_settings (key, value)
      values ('expiration_alerts', ${merged as any}::jsonb)
      on conflict (key) do update set value = excluded.value
    `;
    return { ok: true, settings: merged };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

// --- Billing / Monetization runtime flags ---

export type BillingFlags = {
  enforcePlanLimits: boolean; // storage/views/shares limits
  proPlanEnabled: boolean; // if false, treat 'pro' as 'free' for limits
  pricingUiEnabled: boolean; // show upgrade/pricing UI copy
};

const DEFAULT_BILLING_FLAGS: BillingFlags = {
  // safest-by-default: enforce limits even if settings table is empty
  enforcePlanLimits: true,
  proPlanEnabled: false,
  pricingUiEnabled: false,
};

function envBool(name: string): boolean | null {
  const raw = process.env[name];
  if (raw == null) return null;
  return asBool(raw, false);
}

/**
 * Best-effort DB-backed billing flags.
 *
 * Precedence:
 * 1) DB value (public.app_settings key 'billing_flags')
 * 2) env vars (ENFORCE_PLAN_LIMITS / PRO_PLAN_ENABLED / PRICING_UI_ENABLED)
 * 3) defaults (fail-closed)
 */
export async function getBillingFlags(): Promise<
  | { ok: true; flags: BillingFlags }
  | { ok: false; error: string; flags: BillingFlags }
> {
  const envDefaults: BillingFlags = {
    enforcePlanLimits: envBool("ENFORCE_PLAN_LIMITS") ?? DEFAULT_BILLING_FLAGS.enforcePlanLimits,
    proPlanEnabled: envBool("PRO_PLAN_ENABLED") ?? DEFAULT_BILLING_FLAGS.proPlanEnabled,
    pricingUiEnabled: envBool("PRICING_UI_ENABLED") ?? DEFAULT_BILLING_FLAGS.pricingUiEnabled,
  };

  try {
    const rows = (await sql`
      select value
      from public.app_settings
      where key = 'billing_flags'
      limit 1
    `) as unknown as Array<{ value: any }>;

    const value = rows?.[0]?.value ?? null;
    if (!value || typeof value !== "object") {
      return { ok: true, flags: { ...envDefaults } };
    }

    return {
      ok: true,
      flags: {
        enforcePlanLimits: asBool(value.enforcePlanLimits, envDefaults.enforcePlanLimits),
        proPlanEnabled: asBool(value.proPlanEnabled, envDefaults.proPlanEnabled),
        pricingUiEnabled: asBool(value.pricingUiEnabled, envDefaults.pricingUiEnabled),
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, flags: { ...envDefaults } };
  }
}

export async function setBillingFlags(next: Partial<BillingFlags>): Promise<
  | { ok: true; flags: BillingFlags }
  | { ok: false; error: string }
> {
  const currentRes = await getBillingFlags();
  const current = currentRes.flags;

  const merged: BillingFlags = {
    enforcePlanLimits: typeof next.enforcePlanLimits === "boolean" ? next.enforcePlanLimits : current.enforcePlanLimits,
    proPlanEnabled: typeof next.proPlanEnabled === "boolean" ? next.proPlanEnabled : current.proPlanEnabled,
    pricingUiEnabled: typeof next.pricingUiEnabled === "boolean" ? next.pricingUiEnabled : current.pricingUiEnabled,
  };

  try {
    await sql`
      insert into public.app_settings (key, value)
      values ('billing_flags', ${merged as any}::jsonb)
      on conflict (key) do update set value = excluded.value
    `;
    return { ok: true, flags: merged };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

// --- Security emergency freeze flags ---

export type SecurityFreezeSettings = {
  globalServeDisabled: boolean;
  shareServeDisabled: boolean;
  aliasServeDisabled: boolean;
  ticketServeDisabled: boolean;
};

const DEFAULT_SECURITY_FREEZE: SecurityFreezeSettings = {
  globalServeDisabled: false,
  shareServeDisabled: false,
  aliasServeDisabled: false,
  ticketServeDisabled: false,
};

export async function getSecurityFreezeSettings(): Promise<
  | { ok: true; settings: SecurityFreezeSettings }
  | { ok: false; error: string; settings: SecurityFreezeSettings }
> {
  try {
    const rows = (await sql`
      select value
      from public.app_settings
      where key = 'security_freeze'
      limit 1
    `) as unknown as Array<{ value: any }>;

    const value = rows?.[0]?.value ?? null;
    if (!value || typeof value !== "object") {
      return { ok: true, settings: { ...DEFAULT_SECURITY_FREEZE } };
    }

    return {
      ok: true,
      settings: {
        globalServeDisabled: asBool(value.globalServeDisabled, DEFAULT_SECURITY_FREEZE.globalServeDisabled),
        shareServeDisabled: asBool(value.shareServeDisabled, DEFAULT_SECURITY_FREEZE.shareServeDisabled),
        aliasServeDisabled: asBool(value.aliasServeDisabled, DEFAULT_SECURITY_FREEZE.aliasServeDisabled),
        ticketServeDisabled: asBool(value.ticketServeDisabled, DEFAULT_SECURITY_FREEZE.ticketServeDisabled),
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, settings: { ...DEFAULT_SECURITY_FREEZE } };
  }
}

export async function setSecurityFreezeSettings(next: Partial<SecurityFreezeSettings>): Promise<
  | { ok: true; settings: SecurityFreezeSettings }
  | { ok: false; error: string }
> {
  const currentRes = await getSecurityFreezeSettings();
  const current = currentRes.settings;

  const merged: SecurityFreezeSettings = {
    globalServeDisabled:
      typeof next.globalServeDisabled === "boolean" ? next.globalServeDisabled : current.globalServeDisabled,
    shareServeDisabled:
      typeof next.shareServeDisabled === "boolean" ? next.shareServeDisabled : current.shareServeDisabled,
    aliasServeDisabled:
      typeof next.aliasServeDisabled === "boolean" ? next.aliasServeDisabled : current.aliasServeDisabled,
    ticketServeDisabled:
      typeof next.ticketServeDisabled === "boolean" ? next.ticketServeDisabled : current.ticketServeDisabled,
  };

  try {
    await sql`
      insert into public.app_settings (key, value)
      values ('security_freeze', ${merged as any}::jsonb)
      on conflict (key) do update set value = excluded.value
    `;
    return { ok: true, settings: merged };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
