import { getSecurityFreezeSettings } from "@/lib/settings";

export function allowUnencryptedServing(): boolean {
  // Security invariant: plaintext serving is disabled.
  // Legacy documents must be migrated to encrypted storage.
  return false;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "y", "on"].includes(raw)) return true;
  if (["0", "false", "no", "n", "off"].includes(raw)) return false;
  return fallback;
}

export async function isGlobalServeDisabled(): Promise<boolean> {
  const envDisabled = envBool("SECURITY_GLOBAL_SERVE_DISABLE", false);
  if (envDisabled) return true;
  const db = await getSecurityFreezeSettings();
  return Boolean(db.settings.globalServeDisabled);
}

export async function isShareServingDisabled(): Promise<boolean> {
  const global = await isGlobalServeDisabled();
  if (global) return true;
  const envDisabled = envBool("SECURITY_SHARE_SERVE_DISABLE", false);
  if (envDisabled) return true;
  const db = await getSecurityFreezeSettings();
  return Boolean(db.settings.shareServeDisabled);
}

export async function isAliasServingDisabled(): Promise<boolean> {
  const global = await isGlobalServeDisabled();
  if (global) return true;
  const envDisabled = envBool("SECURITY_ALIAS_SERVE_DISABLE", false);
  if (envDisabled) return true;
  const db = await getSecurityFreezeSettings();
  return Boolean(db.settings.aliasServeDisabled);
}

export async function isTicketServingDisabled(): Promise<boolean> {
  const global = await isGlobalServeDisabled();
  if (global) return true;
  const envDisabled = envBool("SECURITY_TICKET_SERVE_DISABLE", false);
  if (envDisabled) return true;
  const db = await getSecurityFreezeSettings();
  return Boolean(db.settings.ticketServeDisabled);
}

export function isSecurityTestNoDbMode(): boolean {
  return envBool("SECURITY_TEST_NO_DB", false);
}
