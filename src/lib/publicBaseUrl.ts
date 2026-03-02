type EnvLike = Record<string, string | undefined>;

function clean(input: unknown): string {
  return String(input || "").trim();
}

export function resolvePublicAppBaseUrl(reqUrl: string, env: EnvLike = process.env): string {
  const appUrl = clean(env.APP_URL);
  const nextAuthUrl = clean(env.NEXTAUTH_URL);
  const vercelUrl = clean(env.VERCEL_URL);
  const isProd = clean(env.NODE_ENV).toLowerCase() === "production";

  const configured = appUrl || nextAuthUrl || (vercelUrl ? `https://${vercelUrl}` : "");
  const candidate = configured || new URL(reqUrl).origin;

  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    throw new Error("APP_BASE_URL_INVALID");
  }

  const proto = u.protocol.toLowerCase();
  const host = u.hostname.toLowerCase();
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0:0:0:0:0:0:0:1";

  if (u.username || u.password) throw new Error("APP_BASE_URL_INVALID");
  if (proto === "http:") {
    if (isProd || !isLocal) throw new Error("APP_BASE_URL_INSECURE");
  } else if (proto !== "https:") {
    throw new Error("APP_BASE_URL_INSECURE");
  }

  if (isProd && !configured) {
    throw new Error("APP_BASE_URL_MISSING");
  }

  return u.origin.replace(/\/+$/, "");
}
