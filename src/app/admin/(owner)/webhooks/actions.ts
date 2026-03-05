// src/app/admin/webhooks/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/authz";
import {
  normalizeWebhookEvents,
  normalizeWebhookUrl,
  processWebhookDeliveries,
  sanitizeWebhookErrorForStorage,
} from "@/lib/webhooks";
import { encryptWebhookSecretForStorage } from "@/lib/webhookSecrets";

const MAX_WEBHOOK_ID_LEN = 64;
const MAX_WEBHOOK_NAME_LEN = 120;
const MAX_WEBHOOK_URL_LEN = 2048;
const MAX_WEBHOOK_SECRET_LEN = 512;
const MAX_WEBHOOK_EVENTS = 32;
const MAX_WEBHOOK_EVENT_LEN = 64;

function readFormText(formData: FormData, key: string, maxLen: number): string {
  const raw = String(formData.get(key) || "");
  if (/[\r\n\0]/.test(raw)) throw new Error("Bad request.");
  const value = raw.trim();
  if (value.length > maxLen) throw new Error("Bad request.");
  return value;
}

function parseEvents(formData: FormData): string[] {
  const raw = formData
    .getAll("events")
    .map((v) => String(v || "").trim())
    .filter((v) => v.length > 0 && v.length <= MAX_WEBHOOK_EVENT_LEN && !/[\r\n\0]/.test(v))
    .slice(0, MAX_WEBHOOK_EVENTS);
  return normalizeWebhookEvents(raw);
}

export async function createWebhookAction(formData: FormData): Promise<void> {
  const u = await requireUser();
  if (!(u.role === "owner" || u.role === "admin")) throw new Error("Forbidden");

  const name = readFormText(formData, "name", MAX_WEBHOOK_NAME_LEN);
  const url = normalizeWebhookUrl(readFormText(formData, "url", MAX_WEBHOOK_URL_LEN));
  const plainSecret = readFormText(formData, "secret", MAX_WEBHOOK_SECRET_LEN);
  const secret = plainSecret ? encryptWebhookSecretForStorage(plainSecret) : null;
  const enabledRaw = readFormText(formData, "enabled", 8);
  const enabled = enabledRaw === "on" || enabledRaw === "true" || enabledRaw === "1";
  const events = parseEvents(formData);

  if (!name) throw new Error("Missing name.");

  await sql`
    insert into public.webhooks (owner_id, name, url, secret, events, enabled)
    values (${u.id}::uuid, ${name}, ${url}, ${secret}, ${events}::text[], ${enabled})
  `;

  revalidatePath("/admin/webhooks");
}

export async function updateWebhookAction(formData: FormData): Promise<void> {
  const u = await requireUser();
  if (!(u.role === "owner" || u.role === "admin")) throw new Error("Forbidden");

  const id = readFormText(formData, "id", MAX_WEBHOOK_ID_LEN);
  const name = readFormText(formData, "name", MAX_WEBHOOK_NAME_LEN);
  const url = normalizeWebhookUrl(readFormText(formData, "url", MAX_WEBHOOK_URL_LEN));
  const plainSecret = readFormText(formData, "secret", MAX_WEBHOOK_SECRET_LEN);
  const clearSecretRaw = readFormText(formData, "clear_secret", 8).toLowerCase();
  const clearSecret = clearSecretRaw === "on" || clearSecretRaw === "true" || clearSecretRaw === "1";
  const enabledRaw = readFormText(formData, "enabled", 8);
  const enabled = enabledRaw === "on" || enabledRaw === "true" || enabledRaw === "1";
  const events = parseEvents(formData);

  if (!id) throw new Error("Missing id.");
  if (!name) throw new Error("Missing name.");

  const existingRows = (await sql`
    select secret
    from public.webhooks
    where id = ${id}::uuid
      and owner_id = ${u.id}::uuid
    limit 1
  `) as unknown as Array<{ secret: string | null }>;
  if (!existingRows.length) throw new Error("Webhook not found.");
  const existingSecret = existingRows[0].secret ?? null;

  const secret = clearSecret
    ? null
    : plainSecret
      ? encryptWebhookSecretForStorage(plainSecret)
      : existingSecret;

  await sql`
    update public.webhooks
    set
      name = ${name},
      url = ${url},
      secret = ${secret},
      events = ${events}::text[],
      enabled = ${enabled}
    where id = ${id}::uuid
      and owner_id = ${u.id}::uuid
  `;

  revalidatePath("/admin/webhooks");
}

export async function deleteWebhookAction(formData: FormData): Promise<void> {
  const u = await requireUser();
  if (!(u.role === "owner" || u.role === "admin")) throw new Error("Forbidden");

  const id = readFormText(formData, "id", MAX_WEBHOOK_ID_LEN);
  if (!id) throw new Error("Missing id.");

  await sql`
    delete from public.webhooks
    where id = ${id}::uuid
      and owner_id = ${u.id}::uuid
  `;

  revalidatePath("/admin/webhooks");
}

export async function testWebhookAction(formData: FormData): Promise<void> {
  const u = await requireUser();
  if (!(u.role === "owner" || u.role === "admin")) throw new Error("Forbidden");

  const id = readFormText(formData, "id", MAX_WEBHOOK_ID_LEN);
  if (!id) throw new Error("Missing id.");

  // Prefer queue (if table exists), fall back to setting last_error.
  try {
    const payload = {
      test: true,
      message: "Hello from cyang.io",
      requested_by: u.email,
      requested_at: new Date().toISOString(),
    };

    await sql`
      insert into public.webhook_deliveries (webhook_id, owner_id, event, payload)
      values (${id}::uuid, ${u.id}::uuid, 'webhook.test', ${JSON.stringify(payload)}::jsonb)
    `;

    // Try to deliver immediately for nicer UX.
    await processWebhookDeliveries({ maxBatch: 5, maxAttempts: 8 });
  } catch (e: unknown) {
    const safeError = sanitizeWebhookErrorForStorage(e, "Failed to enqueue test webhook delivery.");
    await sql`
      update public.webhooks
      set last_error = ${safeError}
      where id = ${id}::uuid and owner_id = ${u.id}::uuid
    `;
  }

  revalidatePath("/admin/webhooks");
}
