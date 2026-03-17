import { neon } from "@neondatabase/serverless";
import { normalizeSqlFingerprint, recordQueryFrequency } from "@/lib/perfTelemetry";

let cachedSql: ReturnType<typeof neon> | null = null;
const ALLOWED_DB_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

function getDatabaseUrl(): string {
  const raw = String(process.env.DATABASE_URL || "").trim();
  if (!raw) {
    throw new Error("Missing DATABASE_URL");
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid DATABASE_URL");
  }

  if (!ALLOWED_DB_PROTOCOLS.has(parsed.protocol)) {
    throw new Error("Invalid DATABASE_URL protocol");
  }

  return raw;
}

function getSql(): ReturnType<typeof neon> {
    if (cachedSql) return cachedSql;

    const url = getDatabaseUrl();

    cachedSql = neon(url);
    return cachedSql;
}

// Lazy DB init prevents build-time module evaluation from failing in CI
// when DATABASE_URL is intentionally not present.
type SqlCompat = <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T[]>;
export const sql: SqlCompat = async <T = unknown>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> => {
  const started = Date.now();
  const fingerprint = normalizeSqlFingerprint(strings);
  try {
    const result = await (getSql() as unknown as SqlCompat)(strings, ...values);
    recordQueryFrequency({
      fingerprint,
      durationMs: Date.now() - started,
      ok: true,
    });
    return result as T[];
  } catch (error) {
    recordQueryFrequency({
      fingerprint,
      durationMs: Date.now() - started,
      ok: false,
    });
    throw error;
  }
};
