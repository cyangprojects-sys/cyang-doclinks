export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { verifyApiKeyFromRequest } from "@/lib/apiAuth";
import { processWebhookDeliveries } from "@/lib/webhooks";

export async function POST(req: NextRequest) {
  const auth = await verifyApiKeyFromRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const webhookId = String(body?.webhook_id || body?.webhookId || "").trim() || null;

  // Load hooks
  const hooks = webhookId
    ? ((await sql`
        select id::text as id
        from public.webhooks
        where owner_id = ${auth.ownerId}::uuid
          and enabled = true
          and id = ${webhookId}::uuid
        limit 1
      `) as unknown as Array<{ id: string }> )
    : ((await sql`
        select id::text as id
        from public.webhooks
        where owner_id = ${auth.ownerId}::uuid
          and enabled = true
        order by created_at desc
        limit 50
      `) as unknown as Array<{ id: string }>);

  if (!hooks.length) {
    return NextResponse.json({ ok: false, error: "NO_WEBHOOKS" }, { status: 404 });
  }

  // Enqueue a test event for each (preferred). If queue is unavailable, return 501.
  try {
    for (const h of hooks) {
      const payload = {
        test: true,
        message: body?.message || "Hello from cyang.io",
        requested_at: new Date().toISOString(),
        api_key_prefix: auth.prefix,
      };

      await sql`
        insert into public.webhook_deliveries (webhook_id, owner_id, event, payload)
        values (${h.id}::uuid, ${auth.ownerId}::uuid, 'webhook.test', ${JSON.stringify(payload)}::jsonb)
      `;
    }

    // Small immediate attempt
    const delivered = await processWebhookDeliveries({ maxBatch: 10, maxAttempts: 8 });
    return NextResponse.json({ ok: true, enqueued: hooks.length, delivered });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "DELIVERY_QUEUE_UNAVAILABLE",
        hint: "Run scripts/sql/webhooks.sql to create public.webhook_deliveries, and configure /api/cron/webhooks",
        details: String(e?.message || e || "failed"),
      },
      { status: 501 }
    );
  }
}
