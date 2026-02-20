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
