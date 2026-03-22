import { NextRequest, NextResponse } from "next/server";
import { sendManualPasswordResetEmail } from "@/lib/email";
import { reportException } from "@/lib/observability";
import { withRequestTelemetry } from "@/lib/perfTelemetry";
import { resolvePublicAppBaseUrl } from "@/lib/publicBaseUrl";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";
import { clientIpKey, enforceGlobalApiRateLimit, logSecurityEvent } from "@/lib/securityTelemetry";
import { issueManualPasswordReset } from "@/lib/signup";

export const runtime = "nodejs";

type ResetRequestBody = {
  email?: string | null;
};

const MAX_RESET_REQUEST_BODY_BYTES = 8 * 1024;
const BASIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_RESET_MESSAGE = "If the account is eligible for manual sign-in, a reset link will be sent.";

function parseJsonBodyLength(req: NextRequest): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const out = Number(raw);
  return Number.isFinite(out) ? Math.max(0, Math.floor(out)) : 0;
}

function normalizeEmail(value: unknown): string {
  const email = String(value || "").trim().toLowerCase();
  if (!email || email.length > 320 || /[\r\n\0]/.test(email)) return "";
  return BASIC_EMAIL_RE.test(email) ? email : "";
}

export async function POST(req: NextRequest) {
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_MANUAL_PASSWORD_RESET_REQUEST_MS", 10_000);
  try {
    return await withRequestTelemetry(
      req,
      () =>
        withRouteTimeout(
          (async () => {
            const rl = await enforceGlobalApiRateLimit({
              req,
              scope: "ip:manual_password_reset_request",
              limit: Number(process.env.RATE_LIMIT_MANUAL_PASSWORD_RESET_REQUEST_IP_PER_MIN || 8),
              windowSeconds: 60,
              strict: true,
            });
            if (!rl.ok) {
              return NextResponse.json(
                { ok: false, error: "RATE_LIMIT", message: "Too many reset attempts. Please try again shortly." },
                { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
              );
            }
            if (parseJsonBodyLength(req) > MAX_RESET_REQUEST_BODY_BYTES) {
              return NextResponse.json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
            }

            const body = (await req.json().catch(() => null)) as ResetRequestBody | null;
            if (!body || typeof body !== "object" || Array.isArray(body)) {
              return NextResponse.json({ ok: false, error: "BAD_JSON", message: "Invalid JSON body." }, { status: 400 });
            }

            const email = normalizeEmail(body.email);
            if (!email) {
              return NextResponse.json({ ok: false, error: "INVALID_EMAIL", message: "Enter a valid email address." }, { status: 400 });
            }

            const ipInfo = clientIpKey(req);
            try {
              const result = await issueManualPasswordReset(email);
              if (result) {
                const resetUrl = `${resolvePublicAppBaseUrl(req.url)}/signin/reset?token=${encodeURIComponent(result.token)}&email=${encodeURIComponent(result.email)}`;
                await sendManualPasswordResetEmail({ to: result.email, resetUrl });
              }

              await logSecurityEvent({
                type: "manual_password_reset_requested",
                severity: "low",
                ip: ipInfo.ip,
                scope: "manual_password_reset",
                message: "Manual password reset requested",
                meta: {
                  emailDomain: email.split("@")[1] || null,
                  eligibleAccount: Boolean(result),
                },
              });
            } catch (error: unknown) {
              await reportException({
                error,
                event: "manual_password_reset_request_error",
                context: { route: "/api/auth/manual-password-reset/request" },
              });
              await logSecurityEvent({
                type: "manual_password_reset_request_failed",
                severity: "medium",
                ip: ipInfo.ip,
                scope: "manual_password_reset",
                message: "Manual password reset request failed",
                meta: {
                  emailDomain: email.split("@")[1] || null,
                },
              });
            }

            return NextResponse.json({ ok: true, message: GENERIC_RESET_MESSAGE });
          })(),
          timeoutMs
        ),
      { routeKey: "/api/auth/manual-password-reset/request" }
    );
  } catch (error: unknown) {
    if (isRouteTimeoutError(error)) {
      return NextResponse.json({ ok: false, error: "TIMEOUT", message: "Request timed out. Please try again." }, { status: 504 });
    }
    await reportException({
      error,
      event: "manual_password_reset_request_route_error",
      context: { route: "/api/auth/manual-password-reset/request" },
    });
    return NextResponse.json({ ok: true, message: GENERIC_RESET_MESSAGE });
  }
}
