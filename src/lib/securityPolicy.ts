import { getSecurityFreezeSettings } from "@/lib/settings";
import { readEnvBoolean } from "@/lib/envConfig";

export function allowUnencryptedServing(): boolean {
  // Security invariant: plaintext serving is disabled.
  // Legacy documents must be migrated to encrypted storage.
  return false;
}

export async function isGlobalServeDisabled(): Promise<boolean> {
  const envDisabled = readEnvBoolean("SECURITY_GLOBAL_SERVE_DISABLE", false);
  if (envDisabled) return true;
  const db = await getSecurityFreezeSettings();
  return Boolean(db.settings.globalServeDisabled);
}

export async function isShareServingDisabled(): Promise<boolean> {
  const envGlobalDisabled = readEnvBoolean("SECURITY_GLOBAL_SERVE_DISABLE", false);
  if (envGlobalDisabled) return true;
  const envDisabled = readEnvBoolean("SECURITY_SHARE_SERVE_DISABLE", false);
  if (envDisabled) return true;
  const db = await getSecurityFreezeSettings();
  return Boolean(db.settings.globalServeDisabled || db.settings.shareServeDisabled);
}

export async function isAliasServingDisabled(): Promise<boolean> {
  const envGlobalDisabled = readEnvBoolean("SECURITY_GLOBAL_SERVE_DISABLE", false);
  if (envGlobalDisabled) return true;
  const envDisabled = readEnvBoolean("SECURITY_ALIAS_SERVE_DISABLE", false);
  if (envDisabled) return true;
  const db = await getSecurityFreezeSettings();
  return Boolean(db.settings.globalServeDisabled || db.settings.aliasServeDisabled);
}

export async function isTicketServingDisabled(): Promise<boolean> {
  const envGlobalDisabled = readEnvBoolean("SECURITY_GLOBAL_SERVE_DISABLE", false);
  if (envGlobalDisabled) return true;
  const envDisabled = readEnvBoolean("SECURITY_TICKET_SERVE_DISABLE", false);
  if (envDisabled) return true;
  const db = await getSecurityFreezeSettings();
  return Boolean(db.settings.globalServeDisabled || db.settings.ticketServeDisabled);
}

export function isSecurityTestNoDbMode(): boolean {
  return readEnvBoolean("SECURITY_TEST_NO_DB", false);
}
