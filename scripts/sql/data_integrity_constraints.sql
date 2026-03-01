-- Data integrity hardening for docs/share graph.
-- Safe to run multiple times.

-- Prevent case-insensitive alias collisions.
create unique index if not exists doc_aliases_alias_lower_uniq
  on public.doc_aliases (lower(alias));

do $$
begin
  if to_regclass('public.doc_aliases') is not null
     and to_regclass('public.docs') is not null
     and not exists (
       select 1 from pg_constraint
       where conname = 'doc_aliases_doc_id_fkey_cascade'
     ) then
    alter table public.doc_aliases
      add constraint doc_aliases_doc_id_fkey_cascade
      foreign key (doc_id) references public.docs(id) on delete cascade
      not valid;
  end if;

  if to_regclass('public.doc_aliases') is not null
     and exists (
       select 1 from pg_constraint
       where conname = 'doc_aliases_doc_id_fkey_cascade'
         and convalidated = false
     ) then
    begin
      alter table public.doc_aliases
        validate constraint doc_aliases_doc_id_fkey_cascade;
    exception
      when foreign_key_violation then
        raise notice 'doc_aliases_doc_id_fkey_cascade remains NOT VALID due to orphan rows. Clean up and rerun this script.';
    end;
  end if;
end $$;

do $$
begin
  if to_regclass('public.share_tokens') is not null
     and to_regclass('public.docs') is not null
     and not exists (
       select 1 from pg_constraint
       where conname = 'share_tokens_doc_id_fkey_cascade'
     ) then
    alter table public.share_tokens
      add constraint share_tokens_doc_id_fkey_cascade
      foreign key (doc_id) references public.docs(id) on delete cascade
      not valid;
  end if;

  if to_regclass('public.share_tokens') is not null
     and exists (
       select 1 from pg_constraint
       where conname = 'share_tokens_doc_id_fkey_cascade'
         and convalidated = false
     ) then
    begin
      alter table public.share_tokens
        validate constraint share_tokens_doc_id_fkey_cascade;
    exception
      when foreign_key_violation then
        raise notice 'share_tokens_doc_id_fkey_cascade remains NOT VALID due to orphan rows. Clean up and rerun this script.';
    end;
  end if;
end $$;

do $$
begin
  if to_regclass('public.doc_access_grants') is not null
     and to_regclass('public.docs') is not null
     and not exists (
       select 1 from pg_constraint
       where conname = 'doc_access_grants_doc_id_fkey_cascade'
     ) then
    alter table public.doc_access_grants
      add constraint doc_access_grants_doc_id_fkey_cascade
      foreign key (doc_id) references public.docs(id) on delete cascade
      not valid;
  end if;

  if to_regclass('public.doc_access_grants') is not null
     and exists (
       select 1 from pg_constraint
       where conname = 'doc_access_grants_doc_id_fkey_cascade'
         and convalidated = false
     ) then
    begin
      alter table public.doc_access_grants
        validate constraint doc_access_grants_doc_id_fkey_cascade;
    exception
      when foreign_key_violation then
        raise notice 'doc_access_grants_doc_id_fkey_cascade remains NOT VALID due to orphan rows. Clean up and rerun this script.';
    end;
  end if;
end $$;
