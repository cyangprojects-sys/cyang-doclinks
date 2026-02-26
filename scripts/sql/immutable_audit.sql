-- Immutable audit log (append-only, hash chained)

create table if not exists public.immutable_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  occurred_at timestamptz not null default now(),
  stream_key text not null,
  seq bigint not null,
  previous_hash text null,
  event_hash text not null unique,
  action text not null,
  actor_user_id uuid null,
  org_id uuid null,
  doc_id uuid null,
  subject_id text null,
  ip_hash text null,
  payload jsonb not null default '{}'::jsonb,
  constraint immutable_audit_log_stream_seq_uniq unique (stream_key, seq),
  constraint immutable_audit_log_hash_len check (char_length(event_hash) = 64),
  constraint immutable_audit_log_prev_hash_len check (previous_hash is null or char_length(previous_hash) = 64)
);

create index if not exists immutable_audit_log_stream_created_idx
  on public.immutable_audit_log (stream_key, created_at desc);

create index if not exists immutable_audit_log_doc_created_idx
  on public.immutable_audit_log (doc_id, created_at desc);

create or replace function public.immutable_audit_log_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'immutable_audit_log is append-only';
  end if;
  return new;
end;
$$;

drop trigger if exists immutable_audit_log_no_mutation on public.immutable_audit_log;
create trigger immutable_audit_log_no_mutation
before update or delete on public.immutable_audit_log
for each row execute function public.immutable_audit_log_guard();
