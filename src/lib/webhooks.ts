// src/lib/webhooks.ts
import crypto from "crypto";
import { sql } from "@/lib/db";

export type WebhookEvent =
  | "doc.accessed"
  | "doc.viewed"
  | "share.created"
  | "share.revoked";

type WebhookRow = {
  id: string;
  url: string;
  secret: string | null;
  events: string[]; // text[]
};

function hmac(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

export async function emitWebhook(event: WebhookEvent, payload: any) {
  // Best-effort, never throws.
  try {
    const hooks = (await sql`
      select
        id::text as id,
        url,
        secret,
        events
      from public.webhooks
      where enabled = true
    `) as unknown as WebhookRow[];

    if (!hooks?.length) return;

    const body = JSON.stringify({
      event,
      sent_at: new Date().toISOString(),
      payload,
    });

    await Promise.all(
      hooks
        .filter((h) => !h.events?.length || h.events.includes(event))
        .map(async (h) => {
          try {
            const sig = h.secret ? hmac(h.secret, body) : null;
            const res = await fetch(h.url, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                ...(sig ? { "x-cyang-signature": sig } : {}),
                "x-cyang-event": event,
              },
              body,
            });

            await sql`
              update public.webhooks
              set
                last_sent_at = now(),
                last_status = ${res.status},
                last_error = ${res.ok ? null : `HTTP ${res.status}`}
              where id = ${h.id}::uuid
            `;
          } catch (err: any) {
            await sql`
              update public.webhooks
              set
                last_sent_at = now(),
                last_status = null,
                last_error = ${String(err?.message || err || "unknown error")}
              where id = ${h.id}::uuid
            `;
          }
        })
    );
  } catch {
    // swallow
  }
}
