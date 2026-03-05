export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";
import { setBillingFlags, getBillingFlags } from "@/lib/settings";
import { resolvePublicAppBaseUrl } from "@/lib/publicBaseUrl";
const MAX_BILLING_SETTINGS_FORM_BYTES = 8 * 1024;

function asCheckboxBool(v: FormDataEntryValue | null): boolean {
  // unchecked checkboxes are absent
  if (v == null) return false;
  const s = String(v).toLowerCase();
  return s === "on" || s === "true" || s === "1" || s === "yes";
}

function parseFormBodyLength(req: Request): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const size = Number(raw);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

export async function GET(req: NextRequest) {
  const rl = await enforceGlobalApiRateLimit({
    req,
    scope: "ip:admin_billing_settings_get",
    limit: Number(process.env.RATE_LIMIT_ADMIN_BILLING_SETTINGS_PER_MIN || 60),
    windowSeconds: 60,
    strict: true,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMIT" },
      { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  await requirePermission("billing.manage");
  const res = await getBillingFlags();
  return NextResponse.json(res, { status: res.ok ? 200 : 500 });
}

export async function POST(req: Request) {
  const base = resolvePublicAppBaseUrl(req.url);
  const rl = await enforceGlobalApiRateLimit({
    req,
    scope: "ip:admin_billing_settings",
    limit: Number(process.env.RATE_LIMIT_ADMIN_BILLING_SETTINGS_PER_MIN || 60),
    windowSeconds: 60,
    strict: true,
  });
  if (!rl.ok) {
    const url = new URL("/admin/billing", base);
    url.searchParams.set("error", "RATE_LIMIT");
    return NextResponse.redirect(url, { status: 303 });
  }

  try {
    await requirePermission("billing.manage");
    if (parseFormBodyLength(req) > MAX_BILLING_SETTINGS_FORM_BYTES) {
      const url = new URL("/admin/billing", base);
      url.searchParams.set("error", "PAYLOAD_TOO_LARGE");
      return NextResponse.redirect(url, { status: 303 });
    }

    const form = await req.formData();
    const next = {
      enforcePlanLimits: asCheckboxBool(form.get("enforcePlanLimits")),
      proPlanEnabled: asCheckboxBool(form.get("proPlanEnabled")),
      pricingUiEnabled: asCheckboxBool(form.get("pricingUiEnabled")),
    };

    const saved = await setBillingFlags(next);

    const url = new URL("/admin/billing", base);

    if (saved.ok) {
      url.searchParams.set("saved", "1");
      return NextResponse.redirect(url, { status: 303 });
    }

    url.searchParams.set("error", "SAVE_FAILED");
    return NextResponse.redirect(url, { status: 303 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "SERVER_ERROR";
    const safeError =
      msg === "FORBIDDEN" || msg === "UNAUTHENTICATED"
        ? "FORBIDDEN"
        : msg.startsWith("APP_BASE_URL_")
          ? "ENV_MISCONFIGURED"
          : "SERVER_ERROR";
    const url = new URL("/admin/billing", base);
    url.searchParams.set("error", safeError);
    return NextResponse.redirect(url, { status: 303 });
  }
}
