import { sql } from "@/lib/db";

export async function findMissingPublicTableColumns(
  tableName: string,
  requiredColumns: readonly string[]
): Promise<string[]> {
  const rows = (await sql`
    select column_name::text as column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${tableName}
  `) as Array<{ column_name: string }>;
  const existing = new Set(rows.map((r) => r.column_name));
  return requiredColumns.filter((col) => !existing.has(col));
}
