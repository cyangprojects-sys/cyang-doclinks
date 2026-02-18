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
  const parts = [`${name}=${value}`];
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
