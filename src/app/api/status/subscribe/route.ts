export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { clientIpKey, enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";
import { reportException } from "@/lib/observability";
import { normalizeSubscriptionEmail, subscribeStatusUpdates } from "@/lib/statusSubscriptions";
import { withRequestTelemetry } from "@/lib/perfTelemetry";

type SubscribeBody = {
  email?: string | null;
};

const MAX_SUBSCRIBE_BODY_BYTES = 8 * 1024;

function parseJsonBodyLength(req: NextRequest): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const out = Number(raw);
  return Number.isFinite(out) ? Math.max(0, Math.floor(out)) : 0;
}

function normalizePath(pathname: string): string {
  const path = String(pathname || "").trim();
  if (!path || path.length > 160 || /[\r\n\0]/.test(path)) return "/status";
  return path;
}

export async function POST(req: NextRequest) {
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_STATUS_SUBSCRIBE_MS", 10_000);
  try {
    return await withRequestTelemetry(
      req,
      () => withRouteTimeout(
        (async () => {
        const rl = await enforceGlobalApiRateLimit({
          req,
          scope: "ip:status_subscribe",
          limit: Number(process.env.RATE_LIMIT_STATUS_SUBSCRIBE_IP_PER_MIN || 12),
          windowSeconds: 60,
          strict: true,
        });
        if (!rl.ok) {
          return NextResponse.json(
            { ok: false, error: "RATE_LIMIT", message: "Too many requests. Please try again in a minute." },
            { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
          );
        }
        if (parseJsonBodyLength(req) > MAX_SUBSCRIBE_BODY_BYTES) {
          return NextResponse.json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
        }

        let body: SubscribeBody | null;
        try {
          const parsed = await req.json();
          body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as SubscribeBody) : null;
        } catch {
          return NextResponse.json({ ok: false, error: "BAD_JSON", message: "Invalid JSON body." }, { status: 400 });
        }
        if (!body) {
          return NextResponse.json({ ok: false, error: "BAD_JSON", message: "Invalid JSON body." }, { status: 400 });
        }

        const email = normalizeSubscriptionEmail(body.email);
        if (!email) {
          return NextResponse.json({ ok: false, error: "INVALID_EMAIL", message: "Enter a valid email address." }, { status: 400 });
        }

        const ipInfo = clientIpKey(req);
        try {
          const result = await subscribeStatusUpdates({
            email,
            source: "status_page",
            path: normalizePath(req.nextUrl.pathname),
            userAgent: req.headers.get("user-agent"),
            ip: ipInfo.ip,
          });
          return NextResponse.json({
            ok: true,
            created: result.created,
            reactivated: result.reactivated,
            message: "You are subscribed to daily status updates.",
          });
        } catch (error: unknown) {
          if (error instanceof Error && error.message === "MISSING_CONTACT_SUBSCRIBERS_TABLE") {
            return NextResponse.json(
              {
                ok: false,
                error: "STATUS_SUBSCRIBE_UNAVAILABLE",
                message: "Status subscriptions are not available yet. Please contact support.",
              },
              { status: 503 }
            );
          }
          if (error instanceof Error && error.message === "INVALID_EMAIL") {
            return NextResponse.json({ ok: false, error: "INVALID_EMAIL", message: "Enter a valid email address." }, { status: 400 });
          }
          throw error;
        }
        })(),
        timeoutMs
      ),
      { routeKey: "/api/status/subscribe" }
    );
  } catch (error: unknown) {
    if (isRouteTimeoutError(error)) {
      return NextResponse.json({ ok: false, error: "TIMEOUT", message: "Request timed out. Please try again." }, { status: 504 });
    }
    await reportException({
      error,
      event: "status_subscribe_route_error",
      context: { route: "/api/status/subscribe" },
    });
    return NextResponse.json({ ok: false, error: "SERVER_ERROR", message: "Unable to save subscription." }, { status: 500 });
  }
}
