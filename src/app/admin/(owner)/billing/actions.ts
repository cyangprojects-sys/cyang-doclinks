"use server";

import { redirect } from "next/navigation";
import { getAuthedUser } from "@/lib/authz";
import { setBillingFlags } from "@/lib/settings";

const MAX_CHECKBOX_LEN = 8;

function readCheckboxValue(formData: FormData, key: string): FormDataEntryValue | null {
  const value = formData.get(key);
  if (value == null) return null;
  const text = String(value || "");
  if (text.length > MAX_CHECKBOX_LEN || /[\r\n\0]/.test(text)) {
    throw new Error("Bad request.");
  }
  return value;
}

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

  const enforcePlanLimits = asCheckboxBool(readCheckboxValue(formData, "enforcePlanLimits"));
  const proPlanEnabled = asCheckboxBool(readCheckboxValue(formData, "proPlanEnabled"));
  const pricingUiEnabled = asCheckboxBool(readCheckboxValue(formData, "pricingUiEnabled"));

  const res = await setBillingFlags({ enforcePlanLimits, proPlanEnabled, pricingUiEnabled });
  if (!res.ok) {
    redirect(`/admin/billing?error=${encodeURIComponent(res.error)}`);
  }

  redirect("/admin/billing?saved=1");
}
