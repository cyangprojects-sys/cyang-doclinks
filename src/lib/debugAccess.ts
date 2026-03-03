function isTruthy(raw: string | null | undefined): boolean {
  const value = String(raw || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function isDebugApiEnabled(): boolean {
  if (!isTruthy(process.env.ADMIN_DEBUG_ENABLED)) return false;
  if (process.env.NODE_ENV !== "production") return true;
  return isTruthy(process.env.ADMIN_DEBUG_ALLOW_PROD);
}

