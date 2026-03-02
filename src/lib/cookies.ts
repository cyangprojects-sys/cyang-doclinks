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
  const n = String(name || "").trim();
  const v = String(value || "");
  if (!n || /[\r\n;]/.test(n) || /[\s,]/.test(n)) {
    throw new Error("INVALID_COOKIE_NAME");
  }
  if (/[\r\n]/.test(v)) {
    throw new Error("INVALID_COOKIE_VALUE");
  }

  const parts = [`${n}=${v}`];
  parts.push(`Path=${opts?.path ?? "/"}`);
  if (opts?.httpOnly ?? true) parts.push("HttpOnly");
  if (opts?.secure ?? true) parts.push("Secure");
  parts.push(`SameSite=${opts?.sameSite ?? "Lax"}`);
  if (typeof opts?.maxAgeSeconds === "number") parts.push(`Max-Age=${opts.maxAgeSeconds}`);
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
  const raw = req.headers.get("cookie") || "";
  const cookies = raw.split(";").map((v) => v.trim());
  for (const c of cookies) {
    const idx = c.indexOf("=");
    if (idx === -1) continue;
    const k = c.slice(0, idx);
    const v = c.slice(idx + 1);
    if (k === name) return v;
  }
  return null;
}
