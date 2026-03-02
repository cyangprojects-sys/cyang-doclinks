export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { processWebhookDeliveries } from "@/lib/webhooks";
import { logCronRun } from "@/lib/cronTelemetry";

function isAuthorized(req: NextRequest): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;

  const auth = (req.headers.get("authorization") || "").trim();
  if (!auth) return false;

  if (auth === secret) return true;
  if (auth.toLowerCase().startsWith("bearer ") && auth.slice(7).trim() === secret) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      {
        ok: false,
        error: "UNAUTHORIZED",
        hint:
          "Set CRON_SECRET in Vercel env vars. Vercel will send it as the Authorization header for cron invocations.",
      },
      { status: 401 }
    );
  }

  const startedAt = Date.now();
  try {
    const res = await processWebhookDeliveries({ maxBatch: 25, maxAttempts: 8 });
    const resObj = (res && typeof res === "object" ? res : {}) as Record<string, unknown>;
    const duration = Date.now() - startedAt;
    await logCronRun({
      job: "webhooks",
      ok: true,
      durationMs: duration,
      meta: {
        attempted: resObj.attempted ?? null,
        delivered: resObj.delivered ?? null,
        failed: resObj.failed ?? null,
      },
    });
    return NextResponse.json({
      ...res,
      now: new Date().toISOString(),
      duration_ms: duration,
    });
  } catch (e: unknown) {
    const duration = Date.now() - startedAt;
    const msg = e instanceof Error ? e.message : String(e);
    await logCronRun({
      job: "webhooks",
      ok: false,
      durationMs: duration,
      meta: { error: msg },
    });
    return NextResponse.json({ ok: false, error: "CRON_WEBHOOKS_FAILED" }, { status: 500 });
  }
}
