// src/lib/webhooks.ts
// Outbound webhook delivery (queue + cron worker).
//
// Delivery model:
// - Preferred: enqueue deliveries to public.webhook_deliveries and let a cron worker deliver with retry/backoff.
// - Fallback: if the queue table doesn't exist (or insert fails), send synchronously best-effort.

import crypto from "crypto";
import { sql } from "@/lib/db";
import { decryptWebhookSecretForUse } from "@/lib/webhookSecrets";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WEBHOOK_BODY_MAX_BYTES = 64 * 1024;

export type WebhookEvent =
  | "doc.accessed"
  | "doc.viewed"
  | "share.created"
  | "share.revoked"
  | "alias.created"
  | "alias.disabled"
  | "doc.deleted"
  | "webhook.test";

export const WEBHOOK_EVENTS: ReadonlyArray<WebhookEvent> = [
  "doc.accessed",
  "doc.viewed",
  "share.created",
  "share.revoked",
  "alias.created",
  "alias.disabled",
  "doc.deleted",
  "webhook.test",
];

export function normalizeWebhookEvents(input: string[]): WebhookEvent[] {
  const allowed = new Set<string>(WEBHOOK_EVENTS);
  const out: WebhookEvent[] = [];
  for (const raw of input) {
    const event = String(raw || "").trim();
    if (!allowed.has(event)) continue;
    if (out.includes(event as WebhookEvent)) continue;
    out.push(event as WebhookEvent);
  }
  return out;
}

type WebhookRow = {
  id: string;
  owner_id: string;
  url: string;
  secret: string | null;
  events: string[]; // text[]
  enabled: boolean;
};

type DeliveryRow = {
  id: number;
  webhook_id: string;
  owner_id: string;
  url: string;
  secret: string | null;
  event: string;
  payload: unknown;
  attempt_count: number;
};

function payloadDocId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const r = payload as Record<string, unknown>;
  const docId = String(r.doc_id || r.docId || "").trim();
  if (!docId || !UUID_RE.test(docId)) return null;
  return docId;
}

function parseIpv4(hostname: string): number[] | null {
  const m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return octets;
}

function isPrivateOrLoopbackHost(hostnameRaw: string): boolean {
  const hostname = String(hostnameRaw || "").trim().toLowerCase();
  if (!hostname) return true;
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  if (hostname === "::1" || hostname === "0:0:0:0:0:0:0:1") return true;
  if (hostname.startsWith("fe80:") || hostname.startsWith("fc") || hostname.startsWith("fd")) return true;

  const ipv4 = parseIpv4(hostname);
  if (!ipv4) return false;
  const [a, b] = ipv4;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function normalizeWebhookUrl(input: string, env: NodeJS.ProcessEnv = process.env): string {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("Webhook URL is required.");

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Webhook URL is invalid.");
  }

  const protocol = u.protocol.toLowerCase();
  const host = u.hostname.toLowerCase();
  const isProd = String(env.NODE_ENV || "").toLowerCase() === "production";
  const localDevHttpHost = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0:0:0:0:0:0:0:1";

  if (u.username || u.password) throw new Error("Webhook URL must not contain credentials.");

  if (protocol === "http:") {
    if (!localDevHttpHost || isProd) {
      throw new Error("Webhook URL must use HTTPS (HTTP allowed only for localhost in non-production).");
    }
  } else if (protocol !== "https:") {
    throw new Error("Webhook URL must use HTTPS.");
  }

  if (protocol === "https:" && isPrivateOrLoopbackHost(host)) {
    throw new Error("Webhook URL host is not allowed.");
  }

  return u.toString();
}

export function sanitizeWebhookErrorForStorage(error: unknown, fallback = "Delivery failed."): string {
  const raw =
    typeof error === "string"
      ? error.trim()
      : error instanceof Error
        ? String(error.message || "").trim()
        : "";
  if (!raw) return fallback;
  if (/^HTTP\s+\d{3}$/i.test(raw)) return raw.toUpperCase();
  if (/timed out|timeout/i.test(raw)) return "Request timed out.";
  if (/\baborted?\b/i.test(raw)) return "Request aborted.";
  if (/network|fetch failed|econn|enotfound|ehostunreach|socket/i.test(raw)) return "Network error.";
  return fallback;
}

function hmac(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function backoffMs(attempt: number): number {
  // Exponential backoff with jitter, capped.
  // attempt=1 => ~5s, 2=>~15s, 3=>~45s, 4=>~2m, 5=>~6m, 6=>~18m, 7=>~54m, 8=>~2h
  const base = 5000;
  const exp = Math.pow(3, clamp(attempt - 1, 0, 8));
  const raw = base * exp;
  const capped = Math.min(raw, 2 * 60 * 60 * 1000);
  const jitter = Math.floor(Math.random() * 0.25 * capped);
  return capped + jitter;
}

async function listEnabledWebhooks(ownerId: string): Promise<WebhookRow[]> {
  const hooks = (await sql`
    select
      id::text as id,
      owner_id::text as owner_id,
      url,
      secret,
      events,
      enabled
    from public.webhooks
    where enabled = true
      and owner_id = ${ownerId}::uuid
  `) as unknown as WebhookRow[];
  return hooks || [];
}

async function resolveWebhookOwnerId(payload: unknown): Promise<string | null> {
  const docId = payloadDocId(payload);
  if (!docId) return null;
  try {
    const rows = (await sql`
      select owner_id::text as owner_id
      from public.docs
      where id = ${docId}::uuid
      limit 1
    `) as unknown as Array<{ owner_id: string | null }>;
    return rows?.[0]?.owner_id ?? null;
  } catch {
    return null;
  }
}

function buildBody(event: string, payload: unknown): string {
  const body = JSON.stringify({
    event,
    sent_at: new Date().toISOString(),
    payload,
  });
  if (Buffer.byteLength(body, "utf8") <= WEBHOOK_BODY_MAX_BYTES) return body;
  return JSON.stringify({
    event,
    sent_at: new Date().toISOString(),
    payload: { truncated: true },
  });
}

async function deliverOnce(args: {
  url: string;
  secret: string | null;
  event: string;
  body: string;
}): Promise<{ ok: boolean; status: number | null; error: string | null }> {
  try {
    const safeUrl = normalizeWebhookUrl(args.url);
    const sig = args.secret ? hmac(args.secret, args.body) : null;
    const timeoutMsRaw = Number(process.env.WEBHOOK_DELIVERY_TIMEOUT_MS || 10_000);
    const timeoutMs = Number.isFinite(timeoutMsRaw)
      ? Math.max(1000, Math.min(60_000, Math.floor(timeoutMsRaw)))
      : 10_000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await (async () => {
      try {
        return await fetch(safeUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-cyang-event": args.event,
            ...(sig ? { "x-cyang-signature": sig } : {}),
          },
          body: args.body,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    })();

    if (res.ok) return { ok: true, status: res.status, error: null };
    return { ok: false, status: res.status, error: `HTTP ${res.status}` };
  } catch (e: unknown) {
    return { ok: false, status: null, error: sanitizeWebhookErrorForStorage(e) };
  }
}

async function enqueueDeliveries(event: WebhookEvent, ownerId: string, payload: unknown): Promise<boolean> {
  // Returns true if queued, false if queue unavailable.
  const hooks = await listEnabledWebhooks(ownerId);
  if (!hooks.length) return true;

  const selected = hooks.filter((h) => {
    if (!h.events?.length) return true;
    return h.events.includes(event);
  });

  if (!selected.length) return true;

  try {
    const payloadJson = JSON.stringify(payload ?? null);
    // Bulk insert.
    for (const h of selected) {
      await sql`
        insert into public.webhook_deliveries (webhook_id, owner_id, event, payload)
        values (${h.id}::uuid, ${h.owner_id}::uuid, ${event}, ${payloadJson}::jsonb)
      `;
    }
    return true;
  } catch {
    return false;
  }
}

async function deliverSyncBestEffort(event: WebhookEvent, ownerId: string, payload: unknown) {
  // Best-effort, never throws.
  try {
    const hooks = await listEnabledWebhooks(ownerId);
    if (!hooks.length) return;

    const body = buildBody(event, payload);
    await Promise.all(
      hooks
        .filter((h) => !h.events?.length || h.events.includes(event))
        .map(async (h) => {
      let webhookSecret: string | null = null;
      try {
        webhookSecret = decryptWebhookSecretForUse(h.secret);
      } catch {
        webhookSecret = null;
      }
      const res = await deliverOnce({ url: h.url, secret: webhookSecret, event, body });
          await sql`
            update public.webhooks
            set
              last_sent_at = now(),
              last_status = ${res.status},
              last_error = ${res.ok ? null : res.error}
            where id = ${h.id}::uuid
          `;
        })
    );
  } catch {
    // swallow
  }
}

/**
 * Public entrypoint for app code.
 *
 * - Enqueues into webhook_deliveries when available.
 * - Falls back to sync best-effort if queue isn't available.
 */
export async function emitWebhook(event: WebhookEvent, payload: unknown) {
  try {
    const ownerId = await resolveWebhookOwnerId(payload);
    if (!ownerId) return;

    const queued = await enqueueDeliveries(event, ownerId, payload);
    if (!queued) {
      await deliverSyncBestEffort(event, ownerId, payload);
    }
  } catch {
    // swallow
  }
}

export async function processWebhookDeliveries(opts?: {
  maxBatch?: number;
  maxAttempts?: number;
}): Promise<{ ok: true; processed: number; succeeded: number; dead: number; failed: number } | { ok: false; error: string }> {
  const maxBatchRaw = Number(opts?.maxBatch ?? 25);
  const maxAttemptsRaw = Number(opts?.maxAttempts ?? 8);
  const maxBatch = Number.isFinite(maxBatchRaw) ? Math.max(1, Math.min(200, Math.floor(maxBatchRaw))) : 25;
  const maxAttempts = Number.isFinite(maxAttemptsRaw) ? Math.max(1, Math.min(20, Math.floor(maxAttemptsRaw))) : 8;

  try {
    // Grab a small batch of due deliveries. Using FOR UPDATE SKIP LOCKED for concurrency.
    const rows = (await sql`
      with due as (
        select d.id
        from public.webhook_deliveries d
        where d.status in ('pending','delivering')
          and d.next_attempt_at <= now()
        order by d.next_attempt_at asc, d.id asc
        limit ${maxBatch}
        for update skip locked
      )
      select
        d.id,
        d.webhook_id::text as webhook_id,
        d.owner_id::text as owner_id,
        w.url,
        w.secret,
        d.event,
        d.payload,
        d.attempt_count
      from public.webhook_deliveries d
      join public.webhooks w on w.id = d.webhook_id
      join due on due.id = d.id
    `) as unknown as DeliveryRow[];

    if (!rows?.length) {
      return { ok: true, processed: 0, succeeded: 0, dead: 0, failed: 0 };
    }

    let processed = 0;
    let succeeded = 0;
    let dead = 0;
    let failed = 0;

    for (const r of rows) {
      processed += 1;

      // Mark delivering
      await sql`
        update public.webhook_deliveries
        set status = 'delivering', updated_at = now()
        where id = ${r.id}
      `;

      const body = buildBody(r.event, r.payload);
      let webhookSecret: string | null = null;
      try {
        webhookSecret = decryptWebhookSecretForUse(r.secret);
      } catch {
        webhookSecret = null;
      }
      const res = await deliverOnce({ url: r.url, secret: webhookSecret, event: r.event, body });

      const nextAttempt = r.attempt_count + 1;
      const shouldDead = !res.ok && nextAttempt >= maxAttempts;
      const delayMs = res.ok ? 0 : backoffMs(nextAttempt);

      if (res.ok) {
        succeeded += 1;
        await sql`
          update public.webhook_deliveries
          set
            status = 'succeeded',
            attempt_count = ${nextAttempt},
            last_attempt_at = now(),
            last_status = ${res.status},
            last_error = null,
            delivered_at = now(),
            updated_at = now()
          where id = ${r.id}
        `;
      } else if (shouldDead) {
        dead += 1;
        await sql`
          update public.webhook_deliveries
          set
            status = 'dead',
            attempt_count = ${nextAttempt},
            last_attempt_at = now(),
            last_status = ${res.status},
            last_error = ${res.error},
            updated_at = now()
          where id = ${r.id}
        `;
      } else {
        failed += 1;
        await sql`
          update public.webhook_deliveries
          set
            status = 'pending',
            attempt_count = ${nextAttempt},
            last_attempt_at = now(),
            last_status = ${res.status},
            last_error = ${res.error},
            next_attempt_at = now() + (${delayMs}::int * interval '1 millisecond'),
            updated_at = now()
          where id = ${r.id}
        `;
      }

      // Update webhook summary (best-effort)
      await sql`
        update public.webhooks
        set
          last_sent_at = now(),
          last_status = ${res.status},
          last_error = ${res.ok ? null : res.error}
        where id = ${r.webhook_id}::uuid
      `;
    }

    return { ok: true, processed, succeeded, dead, failed };
  } catch (e: unknown) {
    return { ok: false, error: sanitizeWebhookErrorForStorage(e, "Failed to process webhook deliveries.") };
  }
}
