export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { setBillingFlags, getBillingFlags } from "@/lib/settings";

function asCheckboxBool(v: FormDataEntryValue | null): boolean {
  // unchecked checkboxes are absent
  if (v == null) return false;
  const s = String(v).toLowerCase();
  return s === "on" || s === "true" || s === "1" || s === "yes";
}

export async function GET() {
  await requireRole("owner");
  const res = await getBillingFlags();
  return NextResponse.json(res, { status: res.ok ? 200 : 500 });
}

export async function POST(req: Request) {
  await requireRole("owner");

  const url = new URL(req.url);

  try {
    const form = await req.formData();
    const next = {
      enforcePlanLimits: asCheckboxBool(form.get("enforcePlanLimits")),
      proPlanEnabled: asCheckboxBool(form.get("proPlanEnabled")),
      pricingUiEnabled: asCheckboxBool(form.get("pricingUiEnabled")),
    };

    const saved = await setBillingFlags(next);

    url.pathname = "/admin/billing";
    url.search = "";

    if (saved.ok) {
      url.searchParams.set("saved", "1");
      return NextResponse.redirect(url, { status: 303 });
    }

    url.searchParams.set("error", encodeURIComponent(saved.error ?? "unknown"));
    return NextResponse.redirect(url, { status: 303 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    url.pathname = "/admin/billing";
    url.search = "";
    url.searchParams.set("error", encodeURIComponent(msg));
    return NextResponse.redirect(url, { status: 303 });
  }
}
