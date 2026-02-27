-- scripts/sql/index_audit.sql
-- Read-only index audit queries for performance readiness.

-- 1) Seq-scan heavy tables (possible missing/ineffective indexes)
select
  st.relname as table_name,
  st.seq_scan,
  st.idx_scan,
  st.n_live_tup,
  case
    when (st.seq_scan + st.idx_scan) = 0 then 0
    else round((st.seq_scan::numeric * 100.0) / (st.seq_scan + st.idx_scan), 2)
  end as seq_scan_pct
from pg_stat_user_tables st
where st.schemaname = 'public'
order by seq_scan_pct desc, st.seq_scan desc;

-- 2) Non-unique, non-primary indexes with zero scans
select
  s.schemaname,
  s.relname as table_name,
  s.indexrelname as index_name,
  s.idx_scan,
  pg_size_pretty(pg_relation_size(s.indexrelid)) as index_size
from pg_stat_user_indexes s
join pg_index i on i.indexrelid = s.indexrelid
where s.schemaname = 'public'
  and s.idx_scan = 0
  and not i.indisprimary
  and not i.indisunique
order by pg_relation_size(s.indexrelid) desc;

-- 3) Foreign keys missing a leading-column supporting index
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
  fk_cols.table_name,
  fk_cols.fk_columns,
  'create index if not exists idx_' || fk_cols.table_name || '_' ||
    replace(fk_cols.fk_columns, ', ', '_') || ' on public.' || fk_cols.table_name ||
    ' (' || fk_cols.fk_columns || ');' as suggested_index
from fk_cols
where not exists (
  select 1
  from pg_index i
  where i.indrelid = fk_cols.conrelid
    and i.indkey::smallint[] [1:cardinality(fk_cols.fk_attnums)] = fk_cols.fk_attnums
)
order by fk_cols.table_name, fk_cols.conname;
