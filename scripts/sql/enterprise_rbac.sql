-- Enterprise RBAC overrides for admin permissions.
-- Default behavior is defined in src/lib/rbac.ts; this table is optional.
-- When a row exists, it overrides default role mapping for that role+permission.

create table if not exists public.role_permissions (
  permission text not null,
  role text not null check (role in ('viewer', 'admin', 'owner')),
  allowed boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (permission, role)
);

create index if not exists role_permissions_role_idx
  on public.role_permissions(role);

