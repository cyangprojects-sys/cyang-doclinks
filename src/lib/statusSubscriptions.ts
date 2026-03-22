import { sql } from "@/lib/db";
import { sendMail } from "@/lib/email";
import { readPreferredEnvText } from "@/lib/envConfig";
import { logSecurityEvent } from "@/lib/securityTelemetry";
import { platformStatusSummary, type StatusCopyState } from "@/lib/statusCopy";

const BASIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LEN = 320;
const MAX_SOURCE_LEN = 80;
const MAX_PATH_LEN = 160;
const MAX_UA_LEN = 256;
const MAX_SEND_BATCH = 5000;
const MIN_SEND_BATCH = 1;
const DEFAULT_SEND_BATCH = 500;
const DEFAULT_SEND_HOUR = 6;
const STATUS_DIGEST_TOPIC = "status_daily";

export type PlatformState = StatusCopyState;

type ContactSubscriberRow = {
  email: string;
};

type ExistingSubscriber = {
  status: string;
};

let hasContactSubscribersCache: boolean | null = null;

function normalizeText(value: unknown, maxLen: number): string | null {
  const text = String(value || "").trim();
  if (!text || text.length > maxLen || /[\r\n\0]/.test(text)) return null;
  return text;
}

export function normalizeSubscriptionEmail(value: unknown): string | null {
  const email = String(value || "").trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LEN || /[\r\n\0]/.test(email)) return null;
  if (!BASIC_EMAIL_RE.test(email)) return null;
  return email;
}

async function contactSubscribersTableExists(): Promise<boolean> {
  if (hasContactSubscribersCache != null) return hasContactSubscribersCache;
  try {
    const rows = (await sql`
      select to_regclass('public.contact_subscribers')::text as reg
    `) as unknown as Array<{ reg: string | null }>;
    hasContactSubscribersCache = Boolean(rows?.[0]?.reg);
    return hasContactSubscribersCache;
  } catch {
    hasContactSubscribersCache = false;
    return false;
  }
}

function appBaseUrl() {
  const appUrl = readPreferredEnvText("NEXT_PUBLIC_APP_URL", ["APP_URL"]) || "https://www.cyang.io";
  return appUrl || "https://www.cyang.io";
}

function parseSendHour(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_SEND_HOUR;
  return Math.max(0, Math.min(23, Math.floor(n)));
}

function parseSendLimit(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_SEND_BATCH;
  return Math.max(MIN_SEND_BATCH, Math.min(MAX_SEND_BATCH, Math.floor(n)));
}

function normalizeTimeZone(raw: string): string {
  const tz = String(raw || "").trim();
  if (!tz || tz.length > 64 || /[\r\n\0]/.test(tz)) return "UTC";
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return "UTC";
  }
}

function zonedParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const read = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const year = read("year");
  const month = read("month");
  const day = read("day");
  const hour = Number(read("hour"));
  return {
    year,
    month,
    day,
    hour: Number.isFinite(hour) ? hour : -1,
    dayKey: `${year}-${month}-${day}`,
  };
}

function statusLabel(state: PlatformState): string {
  if (state === "degraded") return "Degraded performance";
  if (state === "partial_outage") return "Partial outage";
  if (state === "major_outage") return "Major outage";
  if (state === "maintenance") return "Maintenance";
  return "Operational";
}

export async function subscribeStatusUpdates(args: {
  email: string;
  source?: string | null;
  path?: string | null;
  userAgent?: string | null;
  ip?: string | null;
}) {
  const email = normalizeSubscriptionEmail(args.email);
  if (!email) {
    throw new Error("INVALID_EMAIL");
  }
  if (!(await contactSubscribersTableExists())) {
    throw new Error("MISSING_CONTACT_SUBSCRIBERS_TABLE");
  }

  const source = normalizeText(args.source, MAX_SOURCE_LEN) || "status_page";
  const path = normalizeText(args.path, MAX_PATH_LEN) || "/status";
  const userAgent = normalizeText(args.userAgent, MAX_UA_LEN);
  const existing = (await sql`
    select status::text as status
    from public.contact_subscribers
    where email = ${email}
    limit 1
  `) as unknown as ExistingSubscriber[];

  await sql`
    insert into public.contact_subscribers (
      email,
      status,
      topics,
      source,
      subscribed_from,
      first_subscribed_at,
      last_subscribed_at,
      unsubscribed_at,
      metadata
    )
    values (
      ${email},
      'active',
      ARRAY[${STATUS_DIGEST_TOPIC}]::text[],
      ${source},
      ${path},
      now(),
      now(),
      null,
      ${JSON.stringify({
        userAgent: userAgent ?? null,
        origin: path,
      })}::jsonb
    )
    on conflict (email)
    do update set
      status = 'active',
      topics = case
        when array_position(coalesce(public.contact_subscribers.topics, ARRAY[]::text[]), ${STATUS_DIGEST_TOPIC}) is null
          then array_append(coalesce(public.contact_subscribers.topics, ARRAY[]::text[]), ${STATUS_DIGEST_TOPIC})
        else coalesce(public.contact_subscribers.topics, ARRAY[]::text[])
      end,
      source = coalesce(excluded.source, public.contact_subscribers.source),
      subscribed_from = coalesce(excluded.subscribed_from, public.contact_subscribers.subscribed_from),
      last_subscribed_at = now(),
      unsubscribed_at = null
  `;

  const previousStatus = existing?.[0]?.status || null;
  const created = !previousStatus;
  const reactivated = Boolean(previousStatus && previousStatus !== "active");

  await logSecurityEvent({
    type: "status_subscription_added",
    severity: "low",
    ip: args.ip || null,
    scope: "status_subscriptions",
    message: "Status updates subscription stored",
    meta: {
      emailDomain: email.split("@")[1] || null,
      created,
      reactivated,
      source,
    },
  });

  return { ok: true as const, created, reactivated };
}

export async function runStatusDailyDigest(args?: {
  now?: Date;
  platformState?: PlatformState;
}) {
  if (!(await contactSubscribersTableExists())) {
    return {
      ok: false as const,
      skipped: true as const,
      reason: "missing_contact_subscribers_table",
      sent: 0,
      failed: 0,
    };
  }

  const now = args?.now ?? new Date();
  const timeZone = normalizeTimeZone(String(process.env.STATUS_DAILY_SEND_TIMEZONE || "UTC"));
  const sendHour = parseSendHour(String(process.env.STATUS_DAILY_SEND_HOUR || DEFAULT_SEND_HOUR));
  const local = zonedParts(now, timeZone);
  if (local.hour !== sendHour) {
    return {
      ok: true as const,
      skipped: true as const,
      reason: "outside_send_window",
      sent: 0,
      failed: 0,
      timeZone,
      sendHour,
      localHour: local.hour,
    };
  }

  const limit = parseSendLimit(String(process.env.STATUS_DAILY_SEND_MAX_RECIPIENTS || DEFAULT_SEND_BATCH));
  const recipients = (await sql`
    select email
    from public.contact_subscribers
    where status = 'active'
      and coalesce(public.contact_subscribers.topics, ARRAY[]::text[]) @> ARRAY[${STATUS_DIGEST_TOPIC}]::text[]
      and coalesce(last_status_digest_date, date '1900-01-01') < ${local.dayKey}::date
    order by last_subscribed_at desc
    limit ${limit}
  `) as unknown as ContactSubscriberRow[];

  if (!recipients.length) {
    return {
      ok: true as const,
      skipped: false as const,
      reason: "no_recipients_due",
      sent: 0,
      failed: 0,
      dayKey: local.dayKey,
      timeZone,
      sendHour,
      attempted: 0,
    };
  }

  const state = args?.platformState || "operational";
  const label = statusLabel(state);
  const summary = platformStatusSummary(state);
  const dateLabel = new Date(now).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
  const statusUrl = `${appBaseUrl().replace(/\/+$/, "")}/status`;
  const subject = `Cyang daily status update: ${label}`;
  const text =
    `Cyang daily system status update\n\n` +
    `Date: ${dateLabel}\n` +
    `Overall status: ${label}\n` +
    `${summary}\n\n` +
    `Live status page: ${statusUrl}\n\n` +
    `You are receiving this because status updates were requested for this email from ${statusUrl}.\n` +
    `Need help? Contact support@cyang.io.\n`;

  let sent = 0;
  let failed = 0;
  const batchSize = Math.min(20, Math.max(1, Number(process.env.STATUS_DAILY_SEND_CONCURRENCY || 8)));

  for (let i = 0; i < recipients.length; i += batchSize) {
    const chunk = recipients.slice(i, i + batchSize);
    const successfulEmails: string[] = [];
    const results = await Promise.allSettled(
      chunk.map(async (recipient) => {
        await sendMail({
          to: recipient.email,
          subject,
          text,
        });
        successfulEmails.push(recipient.email);
      })
    );
    if (successfulEmails.length > 0) {
      await sql`
        update public.contact_subscribers
        set
          last_status_digest_date = ${local.dayKey}::date,
          last_status_digest_sent_at = now()
        where email = any(${successfulEmails}::text[])
      `;
    }
    for (const result of results) {
      if (result.status === "fulfilled") {
        sent += 1;
      } else {
        failed += 1;
      }
    }
  }

  if (failed > 0) {
    await logSecurityEvent({
      type: "status_digest_send_partial_failure",
      severity: "medium",
      scope: "status_subscriptions",
      message: "Daily status digest completed with failures",
      meta: {
        dayKey: local.dayKey,
        sent,
        failed,
        attempted: recipients.length,
        timeZone,
        sendHour,
      },
    });
  }

  return {
    ok: failed === 0,
    skipped: false as const,
    sent,
    failed,
    attempted: recipients.length,
    dayKey: local.dayKey,
    timeZone,
    sendHour,
  };
}
