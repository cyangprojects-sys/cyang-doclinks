"use server";

import { redirect } from "next/navigation";
import { getAuthedUser } from "@/lib/authz";
import { setBillingFlags } from "@/lib/settings";

function asCheckboxBool(v: FormDataEntryValue | null): boolean {
  // unchecked checkboxes are absent
  if (v == null) return false;
  const s = String(v).toLowerCase();
  return s === "on" || s === "true" || s === "1" || s === "yes";
}

export async function saveBillingFlagsAction(formData: FormData) {
  const u = await getAuthedUser();
  if (!u) throw new Error("Unauthorized.");
  if (u.role !== "owner") throw new Error("Forbidden.");

  const enforcePlanLimits = asCheckboxBool(formData.get("enforcePlanLimits"));
  const proPlanEnabled = asCheckboxBool(formData.get("proPlanEnabled"));
  const pricingUiEnabled = asCheckboxBool(formData.get("pricingUiEnabled"));

  const res = await setBillingFlags({ enforcePlanLimits, proPlanEnabled, pricingUiEnabled });
  if (!res.ok) {
    redirect(`/admin/billing?error=${encodeURIComponent(res.error)}`);
  }

  redirect("/admin/billing?saved=1");
}
