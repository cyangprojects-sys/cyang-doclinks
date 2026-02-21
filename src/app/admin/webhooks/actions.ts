// src/app/admin/webhooks/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/authz";
import { processWebhookDeliveries } from "@/lib/webhooks";

function parseEvents(formData: FormData): string[] {
  const raw = formData.getAll("events").map((v) => String(v || "").trim()).filter(Boolean);
  // Ensure uniqueness
  return Array.from(new Set(raw));
}

export async function createWebhookAction(formData: FormData): Promise<void> {
  const u = await requireUser();
  if (!(u.role === "owner" || u.role === "admin")) throw new Error("Forbidden");

  const name = String(formData.get("name") || "").trim();
  const url = String(formData.get("url") || "").trim();
  const secret = String(formData.get("secret") || "").trim() || null;
  const enabledRaw = String(formData.get("enabled") || "");
  const enabled = enabledRaw === "on" || enabledRaw === "true" || enabledRaw === "1";
  const events = parseEvents(formData);

  if (!name) throw new Error("Missing name.");
  if (!url || !/^https?:\/\//i.test(url)) throw new Error("URL must start with http:// or https://");

  await sql`
    insert into public.webhooks (owner_id, name, url, secret, events, enabled)
    values (${u.id}::uuid, ${name}, ${url}, ${secret}, ${events}::text[], ${enabled})
  `;

  revalidatePath("/admin/webhooks");
}

export async function updateWebhookAction(formData: FormData): Promise<void> {
  const u = await requireUser();
  if (!(u.role === "owner" || u.role === "admin")) throw new Error("Forbidden");

  const id = String(formData.get("id") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const url = String(formData.get("url") || "").trim();
  const secret = String(formData.get("secret") || "").trim() || null;
  const enabledRaw = String(formData.get("enabled") || "");
  const enabled = enabledRaw === "on" || enabledRaw === "true" || enabledRaw === "1";
  const events = parseEvents(formData);

  if (!id) throw new Error("Missing id.");
  if (!name) throw new Error("Missing name.");
  if (!url || !/^https?:\/\//i.test(url)) throw new Error("URL must start with http:// or https://");

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

  const id = String(formData.get("id") || "").trim();
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

  const id = String(formData.get("id") || "").trim();
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
  } catch (e: any) {
    await sql`
      update public.webhooks
      set last_error = ${String(e?.message || e || "Failed to enqueue test")}
      where id = ${id}::uuid and owner_id = ${u.id}::uuid
    `;
  }

  revalidatePath("/admin/webhooks");
}
