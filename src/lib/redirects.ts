const MAX_REDIRECT_PATH_LEN = 2048;

export function sanitizeInternalRedirectPath(
  raw: string | null | undefined,
  fallback = "/admin/dashboard"
): string {
  const v = String(raw || "").trim().slice(0, MAX_REDIRECT_PATH_LEN);
  if (!v) return fallback;
  if (!v.startsWith("/")) return fallback;
  if (v.startsWith("//")) return fallback;
  if (v.includes("\\") || v.includes("\r") || v.includes("\n")) return fallback;
  let decoded = v;
  try {
    decoded = decodeURIComponent(v);
  } catch {
    return fallback;
  }
  if (decoded.includes("\\") || decoded.includes("\r") || decoded.includes("\n")) return fallback;
  if (decoded.startsWith("/..") || decoded.includes("/../") || decoded.includes("/./")) return fallback;
  return v;
}
