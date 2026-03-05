const MAX_COOKIE_NAME_LEN = 128;
const MAX_COOKIE_VALUE_LEN = 4096;
const MAX_COOKIE_HEADER_LEN = 8192;
const MAX_COOKIE_MAX_AGE_SECONDS = 31_536_000;

function boundedInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function cookieHeader(
  name: string,
  value: string,
  opts?: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Lax" | "Strict" | "None";
    path?: string;
    maxAgeSeconds?: number;
  }
) {
  const n = String(name || "").trim().slice(0, MAX_COOKIE_NAME_LEN);
  const v = String(value || "").slice(0, MAX_COOKIE_VALUE_LEN);
  const path = String(opts?.path ?? "/").trim();
  if (!n || /[\r\n;]/.test(n) || /[\s,]/.test(n)) {
    throw new Error("INVALID_COOKIE_NAME");
  }
  if (!path.startsWith("/") || /[\r\n;]/.test(path)) {
    throw new Error("INVALID_COOKIE_PATH");
  }
  if (/[\r\n;,]/.test(v)) {
    throw new Error("INVALID_COOKIE_VALUE");
  }

  const parts = [`${n}=${v}`];
  parts.push(`Path=${path}`);
  if (opts?.httpOnly ?? true) parts.push("HttpOnly");
  if (opts?.secure ?? true) parts.push("Secure");
  parts.push(`SameSite=${opts?.sameSite ?? "Lax"}`);
  if (typeof opts?.maxAgeSeconds === "number") {
    const maxAge = boundedInt(opts.maxAgeSeconds, 0, 0, MAX_COOKIE_MAX_AGE_SECONDS);
    parts.push(`Max-Age=${maxAge}`);
  }
  return parts.join("; ");
}

export function deleteCookieHeader(name: string) {
  return cookieHeader(name, "", { maxAgeSeconds: 0 });
}

export function shouldUseSecureCookies(env: NodeJS.ProcessEnv = process.env): boolean {
  const appUrl = String(env.APP_URL || "").toLowerCase();
  const nextAuthUrl = String(env.NEXTAUTH_URL || "").toLowerCase();
  const vercel = String(env.VERCEL || "").toLowerCase();
  const vercelEnv = String(env.VERCEL_ENV || "").toLowerCase();
  const nodeEnv = String(env.NODE_ENV || "").toLowerCase();
  return (
    appUrl.startsWith("https://") ||
    nextAuthUrl.startsWith("https://") ||
    vercel === "1" ||
    vercel === "true" ||
    vercelEnv.length > 0 ||
    nodeEnv === "production"
  );
}

export function getCookie(req: Request, name: string): string | null {
  const n = String(name || "").trim().slice(0, MAX_COOKIE_NAME_LEN);
  if (!n || /[\r\n;\s,]/.test(n)) return null;
  const raw = String(req.headers.get("cookie") || "").slice(0, MAX_COOKIE_HEADER_LEN);
  const cookies = raw.split(";").map((v) => v.trim());
  for (const c of cookies) {
    const idx = c.indexOf("=");
    if (idx === -1) continue;
    const k = c.slice(0, idx);
    const v = c.slice(idx + 1).slice(0, MAX_COOKIE_VALUE_LEN);
    if (k === n) return v;
  }
  return null;
}
