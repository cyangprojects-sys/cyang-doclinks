type EnvLike = Record<string, string | undefined>;
const MAX_BASE_URL_INPUT_LEN = 2048;

function clean(input: unknown): string {
  return String(input || "").trim().slice(0, MAX_BASE_URL_INPUT_LEN);
}

function parseAndValidateBase(candidate: string, isProd: boolean): string {
  if (!candidate || /[\r\n\\]/.test(candidate)) {
    throw new Error("APP_BASE_URL_INVALID");
  }
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

  return u.origin.replace(/\/+$/, "");
}

export function resolveConfiguredPublicAppBaseUrl(env: EnvLike = process.env): string {
  const appUrl = clean(env.APP_URL);
  const nextAuthUrl = clean(env.NEXTAUTH_URL);
  const vercelUrl = clean(env.VERCEL_URL);
  const isProd = clean(env.NODE_ENV).toLowerCase() === "production";

  const configured = appUrl || nextAuthUrl || (vercelUrl ? `https://${vercelUrl}` : "");
  if (!configured) {
    if (isProd) throw new Error("APP_BASE_URL_MISSING");
    return "http://localhost:3000";
  }
  return parseAndValidateBase(configured, isProd);
}

export function resolvePublicAppBaseUrl(reqUrl: string, env: EnvLike = process.env): string {
  const isProd = clean(env.NODE_ENV).toLowerCase() === "production";
  try {
    return resolveConfiguredPublicAppBaseUrl(env);
  } catch (e) {
    if (isProd) throw e;
  }
  try {
    return parseAndValidateBase(new URL(reqUrl).origin, false);
  } catch {
    return "http://localhost:3000";
  }
}
