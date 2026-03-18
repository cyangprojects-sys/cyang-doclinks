const CONTROL_CHARS_RE = /[\r\n\0]/;
const BASIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LEN = 320;
const DEFAULT_MAX_ENV_BOOL_LEN = 16;
const DEFAULT_MAX_ENV_INT_LEN = 24;

export function readEnvText(name: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = String(env[name] || "").trim();
  if (!raw || CONTROL_CHARS_RE.test(raw)) return null;
  return raw;
}

export function readPreferredEnvText(
  preferred: string,
  aliases: readonly string[] = [],
  env: NodeJS.ProcessEnv = process.env
): string | null {
  return readAnyEnvText([preferred, ...aliases], env);
}

export function readAnyEnvText(names: readonly string[], env: NodeJS.ProcessEnv = process.env): string | null {
  for (const name of names) {
    const value = readEnvText(name, env);
    if (value) return value;
  }
  return null;
}

export function readEnvBoolean(
  name: string,
  fallback: boolean,
  env: NodeJS.ProcessEnv = process.env,
  maxLen = DEFAULT_MAX_ENV_BOOL_LEN
): boolean {
  const input = String(env[name] || "");
  if (CONTROL_CHARS_RE.test(input)) return fallback;
  const raw = input.trim().toLowerCase();
  if (!raw || raw.length > maxLen) return fallback;
  if (["1", "true", "yes", "y", "on"].includes(raw)) return true;
  if (["0", "false", "no", "n", "off"].includes(raw)) return false;
  return fallback;
}

export function readPreferredEnvBoolean(
  names: readonly string[],
  fallback: boolean,
  env: NodeJS.ProcessEnv = process.env,
  maxLen = DEFAULT_MAX_ENV_BOOL_LEN
): boolean {
  for (const name of names) {
    if (!readEnvText(name, env)) continue;
    return readEnvBoolean(name, fallback, env, maxLen);
  }
  return fallback;
}

export function readEnvInt(
  name: string,
  fallback: number,
  {
    min,
    max,
    env = process.env,
    allowZero = false,
    maxLen = DEFAULT_MAX_ENV_INT_LEN,
  }: {
    min?: number;
    max?: number;
    env?: NodeJS.ProcessEnv;
    allowZero?: boolean;
    maxLen?: number;
  } = {}
): number {
  const input = String(env[name] || "");
  if (CONTROL_CHARS_RE.test(input)) return fallback;
  const raw = input.trim();
  if (!raw || raw.length > maxLen) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  if (!allowZero && parsed <= 0) return fallback;
  let value = Math.floor(parsed);
  if (typeof min === "number") value = Math.max(min, value);
  if (typeof max === "number") value = Math.min(max, value);
  return value;
}

function normalizeEmailEnvValue(value: string | null): string | null {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw.length > MAX_EMAIL_LEN || CONTROL_CHARS_RE.test(raw)) return null;
  if (!BASIC_EMAIL_RE.test(raw)) return null;
  return raw;
}

function readPreferredEnvEmail(
  preferred: string,
  aliases: readonly string[] = [],
  env: NodeJS.ProcessEnv = process.env
): string | null {
  for (const name of [preferred, ...aliases]) {
    const normalized = normalizeEmailEnvValue(readEnvText(name, env));
    if (normalized) return normalized;
  }
  return null;
}

export function getR2BucketEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  return readPreferredEnvText("R2_BUCKET", ["R2_BUCKET_NAME"], env);
}

export function getSupportEmailEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  return readPreferredEnvEmail("SUPPORT_EMAIL", ["CONTACT_EMAIL"], env);
}

export function getDmcaEmailEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  return readPreferredEnvEmail("DMCA_EMAIL", ["DMCA_CONTACT_EMAIL"], env);
}

export function getSecurityEmailEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  return readPreferredEnvEmail("SECURITY_EMAIL", ["RESPONSIBLE_DISCLOSURE_EMAIL"], env);
}

export function getViewBindingSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  return readAnyEnvText(["VIEW_SALT", "NEXTAUTH_SECRET"], env);
}

export function getInviteHashSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  return readAnyEnvText(["NEXTAUTH_SECRET", "VIEW_SALT"], env);
}

export function getApiKeySaltEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  return readAnyEnvText(["API_KEY_SALT", "NEXTAUTH_SECRET", "VIEW_SALT"], env);
}

export function getSecurityTelemetryHashKey(env: NodeJS.ProcessEnv = process.env): string | null {
  return readAnyEnvText(["SECURITY_TELEMETRY_HASH_KEY", "VIEW_SALT", "NEXTAUTH_SECRET", "APP_SECRET"], env);
}

export function getHashingSalt(
  primaryEnv: string,
  aliases: readonly string[] = ["VIEW_SALT", "NEXTAUTH_SECRET"],
  env: NodeJS.ProcessEnv = process.env
): string | null {
  return readAnyEnvText([primaryEnv, ...aliases], env);
}
