const MAX_ENV_BOOL_LEN = 16;

function isTruthy(raw: string | null | undefined): boolean {
  const value = String(raw || "").trim().toLowerCase();
  if (!value || value.length > MAX_ENV_BOOL_LEN || /[\r\n\0]/.test(value)) return false;
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function isProductionEnv(): boolean {
  const raw = String(process.env.NODE_ENV || "");
  if (/[\r\n\0]/.test(raw)) return true;
  return raw.trim().toLowerCase() === "production";
}

export function isDebugApiEnabled(): boolean {
  if (!isTruthy(process.env.ADMIN_DEBUG_ENABLED)) return false;
  if (!isProductionEnv()) return true;
  return isTruthy(process.env.ADMIN_DEBUG_ALLOW_PROD);
}
