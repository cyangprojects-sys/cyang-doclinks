const CONTROL_CHARS_RE = /[\r\n\0]/;
const BASIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LEN = 320;

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

export function getEmailFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  return readPreferredEnvText("EMAIL_FROM", ["RESEND_FROM"], env);
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
