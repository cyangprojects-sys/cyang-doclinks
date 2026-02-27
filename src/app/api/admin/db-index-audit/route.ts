import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SeqScanRiskRow = {
  relname: string;
  seq_scan: number;
  idx_scan: number;
  n_live_tup: number;
  seq_scan_pct: number;
};

type UnusedIndexRow = {
  schemaname: string;
  relname: string;
  indexrelname: string;
  idx_scan: number;
  index_size: string;
};

type MissingFkIndexRow = {
  table_name: string;
  fk_columns: string;
  suggested_index: string;
};

export async function GET() {
  try {
    await requireRole("owner");

    const seqScanRisk = (await sql`
      select
        st.relname::text as relname,
        st.seq_scan::bigint as seq_scan,
        st.idx_scan::bigint as idx_scan,
        st.n_live_tup::bigint as n_live_tup,
        case
          when (st.seq_scan + st.idx_scan) = 0 then 0
          else round((st.seq_scan::numeric * 100.0) / (st.seq_scan + st.idx_scan), 2)
        end as seq_scan_pct
      from pg_stat_user_tables st
      where st.schemaname = 'public'
      order by seq_scan_pct desc, st.seq_scan desc
      limit 30
    `) as unknown as SeqScanRiskRow[];

    const unusedIndexes = (await sql`
      select
        s.schemaname::text as schemaname,
        s.relname::text as relname,
        s.indexrelname::text as indexrelname,
        s.idx_scan::bigint as idx_scan,
        pg_size_pretty(pg_relation_size(s.indexrelid))::text as index_size
      from pg_stat_user_indexes s
      join pg_index i on i.indexrelid = s.indexrelid
      where s.schemaname = 'public'
        and s.idx_scan = 0
        and not i.indisprimary
        and not i.indisunique
      order by pg_relation_size(s.indexrelid) desc
      limit 30
    `) as unknown as UnusedIndexRow[];

    const missingFkIndexes = (await sql`
      with fk as (
        select
          c.conrelid,
          c.conname,
          c.conkey,
          n.nspname as schema_name,
          cl.relname as table_name
        from pg_constraint c
        join pg_class cl on cl.oid = c.conrelid
        join pg_namespace n on n.oid = cl.relnamespace
        where c.contype = 'f'
          and n.nspname = 'public'
      ),
      fk_cols as (
        select
          fk.conrelid,
          fk.table_name,
          fk.conname,
          string_agg(a.attname, ', ' order by ord.ordinality) as fk_columns,
          array_agg(a.attnum order by ord.ordinality) as fk_attnums
        from fk
        join unnest(fk.conkey) with ordinality as ord(attnum, ordinality) on true
        join pg_attribute a on a.attrelid = fk.conrelid and a.attnum = ord.attnum
        group by fk.conrelid, fk.table_name, fk.conname
      )
      select
        fk_cols.table_name::text as table_name,
        fk_cols.fk_columns::text as fk_columns,
        ('create index if not exists idx_' || fk_cols.table_name || '_' ||
          replace(fk_cols.fk_columns, ', ', '_') || ' on public.' || fk_cols.table_name ||
          ' (' || fk_cols.fk_columns || ');')::text as suggested_index
      from fk_cols
      where not exists (
        select 1
        from pg_index i
        where i.indrelid = fk_cols.conrelid
          and i.indkey::smallint[] [1:cardinality(fk_cols.fk_attnums)] = fk_cols.fk_attnums
      )
      order by fk_cols.table_name, fk_cols.conname
      limit 30
    `) as unknown as MissingFkIndexRow[];

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      seq_scan_risk: seqScanRisk,
      unused_indexes: unusedIndexes,
      missing_fk_indexes: missingFkIndexes,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "SERVER_ERROR";
    const status = msg === "FORBIDDEN" || msg === "UNAUTHENTICATED" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
