// src/lib/webhooks.ts
// Outbound webhook delivery (queue + cron worker).
//
// Delivery model:
// - Preferred: enqueue deliveries to public.webhook_deliveries and let a cron worker deliver with retry/backoff.
// - Fallback: if the queue table doesn't exist (or insert fails), send synchronously best-effort.

import crypto from "crypto";
import { sql } from "@/lib/db";

export type WebhookEvent =
  | "doc.accessed"
  | "doc.viewed"
  | "share.created"
  | "share.revoked"
  | "alias.created"
  | "alias.disabled"
  | "doc.deleted"
  | "webhook.test";

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

async function listEnabledWebhooks(): Promise<WebhookRow[]> {
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
  `) as unknown as WebhookRow[];
  return hooks || [];
}

function buildBody(event: string, payload: unknown): string {
  return JSON.stringify({
    event,
    sent_at: new Date().toISOString(),
    payload,
  });
}

async function deliverOnce(args: {
  url: string;
  secret: string | null;
  event: string;
  body: string;
}): Promise<{ ok: boolean; status: number | null; error: string | null }> {
  try {
    const sig = args.secret ? hmac(args.secret, args.body) : null;
    const res = await fetch(args.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cyang-event": args.event,
        ...(sig ? { "x-cyang-signature": sig } : {}),
      },
      body: args.body,
    });

    if (res.ok) return { ok: true, status: res.status, error: null };
    return { ok: false, status: res.status, error: `HTTP ${res.status}` };
  } catch (e: unknown) {
    return { ok: false, status: null, error: e instanceof Error ? e.message : String(e || "unknown error") };
  }
}

async function enqueueDeliveries(event: WebhookEvent, payload: unknown): Promise<boolean> {
  // Returns true if queued, false if queue unavailable.
  const hooks = await listEnabledWebhooks();
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

async function deliverSyncBestEffort(event: WebhookEvent, payload: unknown) {
  // Best-effort, never throws.
  try {
    const hooks = await listEnabledWebhooks();
    if (!hooks.length) return;

    const body = buildBody(event, payload);
    await Promise.all(
      hooks
        .filter((h) => !h.events?.length || h.events.includes(event))
        .map(async (h) => {
          const res = await deliverOnce({ url: h.url, secret: h.secret, event, body });
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
    const queued = await enqueueDeliveries(event, payload);
    if (!queued) {
      await deliverSyncBestEffort(event, payload);
    }
  } catch {
    // swallow
  }
}

export async function processWebhookDeliveries(opts?: {
  maxBatch?: number;
  maxAttempts?: number;
}): Promise<{ ok: true; processed: number; succeeded: number; dead: number; failed: number } | { ok: false; error: string }> {
  const maxBatch = opts?.maxBatch ?? 25;
  const maxAttempts = opts?.maxAttempts ?? 8;

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
      const res = await deliverOnce({ url: r.url, secret: r.secret, event: r.event, body });

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
    return { ok: false, error: e instanceof Error ? e.message : String(e || "unknown error") };
  }
}
