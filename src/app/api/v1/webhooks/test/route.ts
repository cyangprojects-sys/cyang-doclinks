export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { verifyApiKeyFromRequest } from "@/lib/apiAuth";
import { processWebhookDeliveries } from "@/lib/webhooks";
import { clientIpKey, enforceGlobalApiRateLimit, logSecurityEvent } from "@/lib/securityTelemetry";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_WEBHOOK_TEST_BODY_BYTES = 16 * 1024;
const MAX_WEBHOOK_MESSAGE_LEN = 1000;
const MAX_WEBHOOK_ID_LEN = 64;

function isUuid(value: string): boolean {
  return UUID_RE.test(String(value || "").trim());
}

function safeWebhookMessage(value: unknown): string {
  const text = String(value ?? "").replace(/[\r\n]+/g, " ").trim();
  if (/[\0]/.test(text)) return "Hello from cyang.io";
  if (!text) return "Hello from cyang.io";
  return text.slice(0, MAX_WEBHOOK_MESSAGE_LEN);
}

function parseJsonBodyLength(req: NextRequest): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const out = Number(raw);
  return Number.isFinite(out) ? Math.max(0, Math.floor(out)) : 0;
}

export async function POST(req: NextRequest) {
  const requestIp = clientIpKey(req).ip;
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_API_V1_WEBHOOK_TEST_MS", 20_000);
  try {
    return await withRouteTimeout(
      (async () => {
        const rl = await enforceGlobalApiRateLimit({
          req,
          scope: "ip:api",
          limit: Number(process.env.RATE_LIMIT_API_IP_PER_MIN || 240),
          windowSeconds: 60,
          strict: true,
        });
        if (!rl.ok) {
          return NextResponse.json(
            { ok: false, error: "RATE_LIMIT" },
            { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
          );
        }
        if (parseJsonBodyLength(req) > MAX_WEBHOOK_TEST_BODY_BYTES) {
          return NextResponse.json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
        }

        const auth = await verifyApiKeyFromRequest(req);
        if (!auth.ok) {
          return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
        }

        let body: Record<string, unknown> | null = null;
        try {
          const parsed = await req.json();
          body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
        } catch {
          body = {};
        }

        const webhookIdRaw = String(body?.webhook_id || body?.webhookId || "").trim();
        if (webhookIdRaw.length > MAX_WEBHOOK_ID_LEN || /[\r\n\0]/.test(webhookIdRaw)) {
          return NextResponse.json({ ok: false, error: "INVALID_WEBHOOK_ID" }, { status: 400 });
        }
        const webhookId = webhookIdRaw || null;
        if (webhookId && !isUuid(webhookId)) {
          return NextResponse.json({ ok: false, error: "INVALID_WEBHOOK_ID" }, { status: 400 });
        }

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
              message: safeWebhookMessage(body?.message),
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
        } catch (e: unknown) {
          await logSecurityEvent({
            type: "webhook_test_queue_unavailable",
            severity: "medium",
            ip: requestIp,
            actorUserId: auth.ownerId,
            scope: "webhooks",
            message: "Webhook test queue unavailable",
          });
          void e;
          return NextResponse.json(
            {
              ok: false,
              error: "DELIVERY_QUEUE_UNAVAILABLE",
            },
            { status: 501 }
          );
        }
      })(),
      timeoutMs
    );
  } catch (e: unknown) {
    if (isRouteTimeoutError(e)) {
      return NextResponse.json({ ok: false, error: "TIMEOUT" }, { status: 504 });
    }
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
