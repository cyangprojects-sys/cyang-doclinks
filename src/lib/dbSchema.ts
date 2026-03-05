import { sql } from "@/lib/db";

const IDENTIFIER_RE = /^[a-z_][a-z0-9_]{0,62}$/;
const MAX_REQUIRED_COLUMNS = 128;

function normalizeIdentifier(value: unknown): string | null {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw.length > 63 || /[\r\n\0]/.test(raw)) return null;
  if (!IDENTIFIER_RE.test(raw)) return null;
  return raw;
}

export async function findMissingPublicTableColumns(
  tableName: string,
  requiredColumns: readonly string[]
): Promise<string[]> {
  const safeTable = normalizeIdentifier(tableName);
  const safeRequired = Array.from(
    new Set(requiredColumns.slice(0, MAX_REQUIRED_COLUMNS).map((c) => normalizeIdentifier(c)).filter((c): c is string => Boolean(c)))
  );
  if (!safeRequired.length) return [];
  if (!safeTable) return safeRequired;

  const rows = (await sql`
    select column_name::text as column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${safeTable}
  `) as Array<{ column_name: string }>;
  const existing = new Set(rows.map((r) => String(r.column_name || "").trim().toLowerCase()));
  return safeRequired.filter((col) => !existing.has(col));
}
