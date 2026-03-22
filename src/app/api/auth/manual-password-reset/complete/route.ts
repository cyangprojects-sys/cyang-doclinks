import { NextRequest, NextResponse } from "next/server";
import { reportException } from "@/lib/observability";
import { withRequestTelemetry } from "@/lib/perfTelemetry";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";
import { clientIpKey, enforceGlobalApiRateLimit, logSecurityEvent } from "@/lib/securityTelemetry";
import { resetManualPassword } from "@/lib/signup";

export const runtime = "nodejs";

type ResetCompleteBody = {
  email?: string | null;
  token?: string | null;
  password?: string | null;
  confirmPassword?: string | null;
};

const MAX_RESET_COMPLETE_BODY_BYTES = 16 * 1024;

function parseJsonBodyLength(req: NextRequest): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const out = Number(raw);
  return Number.isFinite(out) ? Math.max(0, Math.floor(out)) : 0;
}

export async function POST(req: NextRequest) {
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_MANUAL_PASSWORD_RESET_COMPLETE_MS", 10_000);
  try {
    return await withRequestTelemetry(
      req,
      () =>
        withRouteTimeout(
          (async () => {
            const rl = await enforceGlobalApiRateLimit({
              req,
              scope: "ip:manual_password_reset_complete",
              limit: Number(process.env.RATE_LIMIT_MANUAL_PASSWORD_RESET_COMPLETE_IP_PER_MIN || 8),
              windowSeconds: 60,
              strict: true,
            });
            if (!rl.ok) {
              return NextResponse.json(
                { ok: false, error: "RATE_LIMIT", message: "Too many reset attempts. Please try again shortly." },
                { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
              );
            }
            if (parseJsonBodyLength(req) > MAX_RESET_COMPLETE_BODY_BYTES) {
              return NextResponse.json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
            }

            const body = (await req.json().catch(() => null)) as ResetCompleteBody | null;
            if (!body || typeof body !== "object" || Array.isArray(body)) {
              return NextResponse.json({ ok: false, error: "BAD_JSON", message: "Invalid JSON body." }, { status: 400 });
            }

            const email = String(body.email || "");
            const token = String(body.token || "");
            const password = String(body.password || "");
            const confirmPassword = String(body.confirmPassword || "");
            if (!email || !token || !password || !confirmPassword) {
              return NextResponse.json({ ok: false, error: "MISSING_FIELDS" }, { status: 400 });
            }
            if (password !== confirmPassword) {
              return NextResponse.json({ ok: false, error: "PASSWORD_MISMATCH" }, { status: 400 });
            }

            const ipInfo = clientIpKey(req);
            try {
              const result = await resetManualPassword({ email, token, password });
              await logSecurityEvent({
                type: "manual_password_reset_completed",
                severity: "medium",
                ip: ipInfo.ip,
                scope: "manual_password_reset",
                message: "Manual password reset completed",
                meta: {
                  emailDomain: result.email.split("@")[1] || null,
                },
              });
              return NextResponse.json({
                ok: true,
                message: "Password updated. You can now sign in with the new password.",
              });
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : "RESET_FAILED";
              await logSecurityEvent({
                type: "manual_password_reset_failed",
                severity: "medium",
                ip: ipInfo.ip,
                scope: "manual_password_reset",
                message: "Manual password reset failed",
                meta: {
                  error: message,
                },
              });
              if (message === "INVALID_PASSWORD") {
                return NextResponse.json({ ok: false, error: "WEAK_PASSWORD" }, { status: 400 });
              }
              if (message === "INVALID_TOKEN" || message === "TOKEN_EXPIRED") {
                return NextResponse.json({ ok: false, error: "INVALID_RESET_TOKEN" }, { status: 400 });
              }
              if (message === "SIGNUP_TABLES_MISSING") {
                return NextResponse.json({ ok: false, error: "PASSWORD_RESET_UNAVAILABLE" }, { status: 503 });
              }
              throw error;
            }
          })(),
          timeoutMs
        ),
      { routeKey: "/api/auth/manual-password-reset/complete" }
    );
  } catch (error: unknown) {
    if (isRouteTimeoutError(error)) {
      return NextResponse.json({ ok: false, error: "TIMEOUT", message: "Request timed out. Please try again." }, { status: 504 });
    }
    await reportException({
      error,
      event: "manual_password_reset_complete_route_error",
      context: { route: "/api/auth/manual-password-reset/complete" },
    });
    return NextResponse.json({ ok: false, error: "PASSWORD_RESET_FAILED" }, { status: 500 });
  }
}
