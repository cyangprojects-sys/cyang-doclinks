// src/lib/expirationAlerts.ts
// Nightly expiration alerts (email + in-app notifications)

import { sql } from "@/lib/db";
import { sendMail } from "@/lib/email";
import { getExpirationAlertSettings } from "@/lib/settings";

function getBaseUrl() {
  const explicit = process.env.BASE_URL || process.env.NEXTAUTH_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`.replace(/\/+$/, "");

  return "http://localhost:3000";
}

export type ExpiringAliasRow = {
  owner_id: string;
  owner_email: string;
  doc_id: string;
  title: string | null;
  alias: string | null;
  expires_at: string; // text
};

export type ExpiringShareRow = {
  owner_id: string;
  owner_email: string;
  token: string;
  doc_id: string;
  title: string | null;
  to_email: string | null;
  expires_at: string; // text
};

export type ExpirationAlertsResult = {
  ok: boolean;
  enabled: boolean;
  email_enabled: boolean;
  days: number;
  owners_processed: number;
  sent_count: number;
  alias_items: number;
  share_items: number;
  skipped_reason?: string;
  errors?: string[];
};

function clampDays(days: unknown, fallback: number) {
  const n = typeof days === "number" ? days : Number(String(days ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(30, Math.floor(n)));
}

async function tryUpsertNotification(p: {
  ownerId: string;
  kind: "alias_expiring" | "share_expiring";
  docId: string | null;
  alias?: string | null;
  shareToken?: string | null;
  title?: string | null;
  expiresAt: string; // ISO text
  payload?: any;
}) {
  const dedupeKey = [
    p.ownerId,
    p.kind,
    p.docId || "",
    p.alias || "",
    p.shareToken || "",
    // bucket by day to avoid duplicates on repeated runs
    String(p.expiresAt || "").slice(0, 10),
  ].join(":");

  try {
    await sql`
      insert into public.admin_notifications (
        owner_id,
        kind,
        doc_id,
        alias,
        share_token,
        title,
        expires_at,
        payload,
        dedupe_key
      )
      values (
        ${p.ownerId}::uuid,
        ${p.kind},
        nullif(${p.docId ?? ''}, '')::uuid,
        ${p.alias ?? null},
        ${p.shareToken ?? null},
        ${p.title ?? null},
        ${p.expiresAt}::timestamptz,
        ${(p.payload ?? {}) as any}::jsonb,
        ${dedupeKey}
      )
      on conflict (dedupe_key) do nothing
    `;
  } catch {
    // best-effort; table may not exist yet
  }
}

export async function sendExpirationAlerts(input?: { days?: number }): Promise<ExpirationAlertsResult> {
  const settingsRes = await getExpirationAlertSettings();
  const settings = settingsRes.ok ? settingsRes.settings : { enabled: true, days: 3, emailEnabled: true };

  const days = clampDays(input?.days, settings.days);

  if (!settings.enabled) {
    return {
      ok: true,
      enabled: false,
      email_enabled: settings.emailEnabled,
      days,
      owners_processed: 0,
      sent_count: 0,
      alias_items: 0,
      share_items: 0,
      skipped_reason: "disabled",
    };
  }

  const base = getBaseUrl();
  const errors: string[] = [];

  // 1) Expiring aliases
  let aliases: ExpiringAliasRow[] = [];
  try {
    aliases = (await sql`
      select
        d.owner_id::text as owner_id,
        u.email as owner_email,
        d.id::text as doc_id,
        d.title,
        a.alias,
        a.expires_at::text as expires_at
      from public.doc_aliases a
      join public.docs d on d.id = a.doc_id
      join public.users u on u.id = d.owner_id
      where coalesce(a.is_active, true) = true
        and a.revoked_at is null
        and a.expires_at is not null
        and a.expires_at > now()
        and a.expires_at <= (now() + (${days}::int * interval '1 day'))
      order by d.owner_id, a.expires_at asc
      limit 500
    `) as unknown as ExpiringAliasRow[];
  } catch (e) {
    errors.push(`aliases_query_failed: ${e instanceof Error ? e.message : String(e)}`);
    aliases = [];
  }

  // 2) Expiring shares
  let shares: ExpiringShareRow[] = [];
  try {
    shares = (await sql`
      select
        d.owner_id::text as owner_id,
        u.email as owner_email,
        st.token::text as token,
        d.id::text as doc_id,
        d.title,
        st.to_email,
        st.expires_at::text as expires_at
      from public.share_tokens st
      join public.docs d on d.id = st.doc_id
      join public.users u on u.id = d.owner_id
      where st.revoked_at is null
        and st.expires_at is not null
        and st.expires_at > now()
        and st.expires_at <= (now() + (${days}::int * interval '1 day'))
      order by d.owner_id, st.expires_at asc
      limit 500
    `) as unknown as ExpiringShareRow[];
  } catch (e) {
    errors.push(`shares_query_failed: ${e instanceof Error ? e.message : String(e)}`);
    shares = [];
  }

  // Create in-app notifications (best-effort)
  for (const r of aliases) {
    await tryUpsertNotification({
      ownerId: r.owner_id,
      kind: "alias_expiring",
      docId: r.doc_id,
      alias: r.alias,
      title: r.title,
      expiresAt: r.expires_at,
      payload: { doc_id: r.doc_id, alias: r.alias, expires_at: r.expires_at },
    });
  }
  for (const r of shares) {
    await tryUpsertNotification({
      ownerId: r.owner_id,
      kind: "share_expiring",
      docId: r.doc_id,
      shareToken: r.token,
      title: r.title,
      expiresAt: r.expires_at,
      payload: { doc_id: r.doc_id, token: r.token, to_email: r.to_email, expires_at: r.expires_at },
    });
  }

  // Group per owner
  const owners = new Map<
    string,
    { email: string; aliases: ExpiringAliasRow[]; shares: ExpiringShareRow[] }
  >();

  for (const r of aliases) {
    if (!owners.has(r.owner_id)) owners.set(r.owner_id, { email: r.owner_email, aliases: [], shares: [] });
    owners.get(r.owner_id)!.aliases.push(r);
  }
  for (const r of shares) {
    if (!owners.has(r.owner_id)) owners.set(r.owner_id, { email: r.owner_email, aliases: [], shares: [] });
    owners.get(r.owner_id)!.shares.push(r);
  }

  let sent = 0;

  if (settings.emailEnabled) {
    for (const [ownerId, bucket] of owners.entries()) {
      const to = (bucket.email || "").trim();
      if (!to) continue;

      const lines: string[] = [];

      if (bucket.aliases.length) {
        lines.push(`Aliases expiring in the next ${days} day(s):`);
        for (const r of bucket.aliases) {
          const name = r.title || "Untitled";
          const docUrl = `${base}/admin/docs/${encodeURIComponent(r.doc_id)}`;
          const aliasUrl = r.alias ? `${base}/d/${encodeURIComponent(r.alias)}` : "";
          lines.push(
            `- ${name} (${r.doc_id})\n  expires: ${r.expires_at}\n  admin: ${docUrl}${aliasUrl ? `\n  link: ${aliasUrl}` : ""}`
          );
        }
        lines.push("");
      }

      if (bucket.shares.length) {
        lines.push(`Shares expiring in the next ${days} day(s):`);
        for (const r of bucket.shares) {
          const name = r.title || "Untitled";
          const docUrl = `${base}/admin/docs/${encodeURIComponent(r.doc_id)}`;
          const shareUrl = `${base}/s/${encodeURIComponent(r.token)}`;
          lines.push(
            `- ${name} (${r.doc_id})\n  expires: ${r.expires_at}\n  token: ${r.token}${r.to_email ? `\n  to: ${r.to_email}` : ""}\n  admin: ${docUrl}\n  link: ${shareUrl}`
          );
        }
        lines.push("");
      }

      const body =
        lines.length === 0
          ? `No items expiring in the next ${days} day(s).`
          : lines.join("\n\n");

      try {
        await sendMail({
          to,
          subject: `cyang.io: expirations in ${days} day(s)`,
          text: body,
        });
        sent += 1;
      } catch (e) {
        errors.push(`send_failed(${ownerId}): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    enabled: settings.enabled,
    email_enabled: settings.emailEnabled,
    days,
    owners_processed: owners.size,
    sent_count: sent,
    alias_items: aliases.length,
    share_items: shares.length,
    ...(errors.length ? { errors } : {}),
  };
}
