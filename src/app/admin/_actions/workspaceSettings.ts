"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/authz";
import {
  setExpirationAlertSettings,
  setRetentionSettings,
  type ExpirationAlertSettings,
  type RetentionSettings,
} from "@/lib/settings";

function checkbox(formData: FormData, name: string) {
  return String(formData.get(name) || "") === "1";
}

function numberField(formData: FormData, name: string, fallback: number) {
  const raw = Number(String(formData.get(name) || ""));
  if (!Number.isFinite(raw)) return fallback;
  return Math.floor(raw);
}

export async function saveExpirationAlertsAction(formData: FormData) {
  await requireRole("owner");
  const next: Partial<ExpirationAlertSettings> = {
    enabled: checkbox(formData, "enabled"),
    emailEnabled: checkbox(formData, "emailEnabled"),
    days: numberField(formData, "days", 3),
  };
  await setExpirationAlertSettings(next);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/governance");
}

export async function saveRetentionPolicyAction(formData: FormData) {
  await requireRole("owner");
  const next: Partial<RetentionSettings> = {
    enabled: checkbox(formData, "enabled"),
    deleteExpiredShares: checkbox(formData, "deleteExpiredShares"),
    shareGraceDays: numberField(formData, "shareGraceDays", 0),
  };
  await setRetentionSettings(next);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/governance");
}
