"use server";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { ensureUserByEmail } from "@/lib/authz";
import {
  clearMfaCookie,
  issueRecoveryCodesDisplayCookie,
  enableMfa,
  getOrCreatePendingMfaSecret,
  issueMfaCookie,
  mfaTableExists,
  regenerateRecoveryCodes,
  roleRequiresMfa,
  verifyMfaCode,
} from "@/lib/mfa";
import { sanitizeInternalRedirectPath } from "@/lib/redirects";

const MAX_NEXT_PATH_LEN = 512;
const MAX_MFA_CODE_LEN = 16;

function readFormText(formData: FormData, key: string, maxLen: number): string {
  const raw = String(formData.get(key) || "");
  if (/[\r\n\0]/.test(raw)) throw new Error("BAD_REQUEST");
  const value = raw.trim();
  if (value.length > maxLen) throw new Error("BAD_REQUEST");
  return value;
}

async function getAuthedUser() {
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
  const nextRaw = readFormText(formData, "next", MAX_NEXT_PATH_LEN);
  const next = sanitizeInternalRedirectPath(nextRaw || "/admin/dashboard");
  const user = await getAuthedUser();
  if (!(await mfaTableExists())) {
    redirect(`/mfa?error=table_missing&next=${encodeURIComponent(next)}`);
  }
  await getOrCreatePendingMfaSecret(user.id);
  redirect(`/mfa?setup=1&next=${encodeURIComponent(next)}`);
}

export async function enableMfaAction(formData: FormData): Promise<void> {
  const nextRaw = readFormText(formData, "next", MAX_NEXT_PATH_LEN);
  const next = sanitizeInternalRedirectPath(nextRaw || "/admin/dashboard");
  const code = readFormText(formData, "code", MAX_MFA_CODE_LEN);
  const user = await getAuthedUser();
  const ok = await enableMfa({ userId: user.id, code });
  if (!ok) {
    redirect(`/mfa?error=invalid_code&setup=1&next=${encodeURIComponent(next)}`);
  }
  await issueMfaCookie({ userId: user.id, email: user.email, role: user.role });
  const codes = await regenerateRecoveryCodes(user.id);
  if (codes?.length) {
    await issueRecoveryCodesDisplayCookie(codes);
    redirect(`/mfa?recovery=1&next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}

export async function verifyMfaAction(formData: FormData): Promise<void> {
  const nextRaw = readFormText(formData, "next", MAX_NEXT_PATH_LEN);
  const next = sanitizeInternalRedirectPath(nextRaw || "/admin/dashboard");
  const code = readFormText(formData, "code", MAX_MFA_CODE_LEN);
  const user = await getAuthedUser();
  const ok = await verifyMfaCode({ userId: user.id, code });
  if (!ok) {
    redirect(`/mfa?error=invalid_code&next=${encodeURIComponent(next)}`);
  }
  await issueMfaCookie({ userId: user.id, email: user.email, role: user.role });
  redirect(next);
}

export async function clearMfaSessionAction(): Promise<void> {
  await clearMfaCookie();
  redirect("/mfa");
}

export async function regenerateRecoveryCodesAction(formData: FormData): Promise<void> {
  const nextRaw = readFormText(formData, "next", MAX_NEXT_PATH_LEN);
  const next = sanitizeInternalRedirectPath(nextRaw || "/admin/dashboard");
  const user = await getAuthedUser();
  const codes = await regenerateRecoveryCodes(user.id);
  if (!codes?.length) {
    redirect(`/mfa?error=recovery_unavailable&next=${encodeURIComponent(next)}`);
  }
  await issueRecoveryCodesDisplayCookie(codes);
  redirect(`/mfa?recovery=1&next=${encodeURIComponent(next)}`);
}
