export function sanitizeInternalRedirectPath(
  raw: string | null | undefined,
  fallback = "/admin/dashboard"
): string {
  const v = String(raw || "").trim();
  if (!v.startsWith("/")) return fallback;
  if (v.startsWith("//")) return fallback;
  if (v.includes("\\") || v.includes("\r") || v.includes("\n")) return fallback;
  return v;
}
