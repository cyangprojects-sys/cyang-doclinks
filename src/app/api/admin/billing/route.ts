export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { setBillingFlags, getBillingFlags } from "@/lib/settings";
import { resolvePublicAppBaseUrl } from "@/lib/publicBaseUrl";

function asCheckboxBool(v: FormDataEntryValue | null): boolean {
  // unchecked checkboxes are absent
  if (v == null) return false;
  const s = String(v).toLowerCase();
  return s === "on" || s === "true" || s === "1" || s === "yes";
}

export async function GET() {
  await requirePermission("billing.manage");
  const res = await getBillingFlags();
  return NextResponse.json(res, { status: res.ok ? 200 : 500 });
}

export async function POST(req: Request) {
  const base = resolvePublicAppBaseUrl(req.url);

  try {
    await requirePermission("billing.manage");
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
