import { neon } from "@neondatabase/serverless";

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
export const sql: SqlCompat = (strings, ...values) =>
  (getSql() as unknown as SqlCompat)(strings, ...values);
