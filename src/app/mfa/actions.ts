"use server";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { ensureUserByEmail } from "@/lib/authz";
import {
  clearMfaCookie,
  enableMfa,
  getOrCreatePendingMfaSecret,
  issueMfaCookie,
  mfaTableExists,
  roleRequiresMfa,
  verifyMfaCode,
} from "@/lib/mfa";

async function getPrivilegedAuthedUser() {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || "").trim().toLowerCase();
  const role = String((session?.user as { role?: string } | undefined)?.role || "viewer");
  if (!email || (role !== "admin" && role !== "owner")) {
    throw new Error("FORBIDDEN");
  }
  const orgId = (session?.user as { orgId?: string | null } | undefined)?.orgId ?? null;
  const orgSlug = (session?.user as { orgSlug?: string | null } | undefined)?.orgSlug ?? null;
  const user = await ensureUserByEmail(email, { orgId, orgSlug });
  if (!roleRequiresMfa(user.role)) throw new Error("FORBIDDEN");
  return user;
}

export async function beginMfaSetupAction(formData: FormData): Promise<void> {
  const next = String(formData.get("next") || "/admin/dashboard").trim() || "/admin/dashboard";
  const user = await getPrivilegedAuthedUser();
  if (!(await mfaTableExists())) {
    redirect(`/mfa?error=table_missing&next=${encodeURIComponent(next)}`);
  }
  await getOrCreatePendingMfaSecret(user.id);
  redirect(`/mfa?setup=1&next=${encodeURIComponent(next)}`);
}

export async function enableMfaAction(formData: FormData): Promise<void> {
  const next = String(formData.get("next") || "/admin/dashboard").trim() || "/admin/dashboard";
  const code = String(formData.get("code") || "").trim();
  const user = await getPrivilegedAuthedUser();
  const ok = await enableMfa({ userId: user.id, code });
  if (!ok) {
    redirect(`/mfa?error=invalid_code&setup=1&next=${encodeURIComponent(next)}`);
  }
  await issueMfaCookie({ userId: user.id, email: user.email, role: user.role });
  redirect(next.startsWith("/") ? next : "/admin/dashboard");
}

export async function verifyMfaAction(formData: FormData): Promise<void> {
  const next = String(formData.get("next") || "/admin/dashboard").trim() || "/admin/dashboard";
  const code = String(formData.get("code") || "").trim();
  const user = await getPrivilegedAuthedUser();
  const ok = await verifyMfaCode({ userId: user.id, code });
  if (!ok) {
    redirect(`/mfa?error=invalid_code&next=${encodeURIComponent(next)}`);
  }
  await issueMfaCookie({ userId: user.id, email: user.email, role: user.role });
  redirect(next.startsWith("/") ? next : "/admin/dashboard");
}

export async function clearMfaSessionAction(): Promise<void> {
  await clearMfaCookie();
  redirect("/mfa");
}

