import { sql } from "@/lib/db";
import { type AuthedUser, type Role, requireUser, roleAtLeast } from "@/lib/authz";

export type Permission =
  | "audit.export"
  | "abuse.manage"
  | "dmca.manage"
  | "billing.manage"
  | "billing.override"
  | "retention.run"
  | "security.keys.read"
  | "security.keys.manage"
  | "security.migrate_legacy";

export const RBAC_PERMISSIONS: Permission[] = [
  "audit.export",
  "abuse.manage",
  "dmca.manage",
  "billing.manage",
  "billing.override",
  "retention.run",
  "security.keys.read",
  "security.keys.manage",
  "security.migrate_legacy",
];
const RBAC_PERMISSION_SET = new Set<Permission>(RBAC_PERMISSIONS);
const RBAC_ROLES: Role[] = ["viewer", "admin", "owner"];
const RBAC_ROLE_SET = new Set<Role>(RBAC_ROLES);
const MAX_RBAC_OVERRIDE_ROWS = 5000;

const DEFAULT_MIN_ROLE: Record<Permission, Role> = {
  "audit.export": "admin",
  "abuse.manage": "admin",
  "dmca.manage": "admin",
  "billing.manage": "owner",
  "billing.override": "owner",
  "retention.run": "admin",
  "security.keys.read": "owner",
  "security.keys.manage": "owner",
  "security.migrate_legacy": "owner",
};

let permissionsTableExistsCache: boolean | null = null;

function normalizePermission(value: unknown): Permission | null {
  const raw = String(value ?? "").trim();
  if (!raw || /[\r\n\0]/.test(raw)) return null;
  return RBAC_PERMISSION_SET.has(raw as Permission) ? (raw as Permission) : null;
}

function normalizeRole(value: unknown): Role | null {
  const raw = String(value ?? "").trim();
  if (!raw || /[\r\n\0]/.test(raw)) return null;
  return RBAC_ROLE_SET.has(raw as Role) ? (raw as Role) : null;
}

export async function permissionsTableExists(): Promise<boolean> {
  if (permissionsTableExistsCache != null) return permissionsTableExistsCache;
  try {
    const rows = (await sql`select to_regclass('public.role_permissions')::text as reg`) as unknown as Array<{ reg: string | null }>;
    permissionsTableExistsCache = Boolean(rows?.[0]?.reg);
  } catch {
    permissionsTableExistsCache = false;
  }
  return permissionsTableExistsCache;
}

async function isAllowedByOverride(role: Role, permission: Permission): Promise<boolean | null> {
  const safeRole = normalizeRole(role);
  const safePermission = normalizePermission(permission);
  if (!safeRole || !safePermission) return null;
  if (!(await permissionsTableExists())) return null;
  try {
    const rows = (await sql`
      select allowed::boolean as allowed
      from public.role_permissions
      where role = ${safeRole}::text
        and permission = ${safePermission}::text
      limit 1
    `) as unknown as Array<{ allowed: boolean }>;
    if (!rows?.length) return null;
    return typeof rows[0].allowed === "boolean" ? rows[0].allowed : null;
  } catch {
    return null;
  }
}

export async function userHasPermission(user: AuthedUser, permission: Permission): Promise<boolean> {
  const safeRole = normalizeRole(user?.role);
  const safePermission = normalizePermission(permission);
  if (!safeRole || !safePermission) return false;

  const override = await isAllowedByOverride(safeRole, safePermission);
  if (override != null) return override;
  return roleAtLeast(safeRole, DEFAULT_MIN_ROLE[safePermission]);
}

export async function requirePermission(permission: Permission): Promise<AuthedUser> {
  const safePermission = normalizePermission(permission);
  if (!safePermission) throw new Error("FORBIDDEN");
  const user = await requireUser();
  const ok = await userHasPermission(user, safePermission);
  if (!ok) throw new Error("FORBIDDEN");
  return user;
}

export async function listRolePermissionOverrides(): Promise<Array<{ permission: Permission; role: Role; allowed: boolean; updated_at: string }>> {
  if (!(await permissionsTableExists())) return [];
  const rows = (await sql`
    select
      permission::text as permission,
      role::text as role,
      allowed::boolean as allowed,
      updated_at::text as updated_at
    from public.role_permissions
    order by permission asc, role asc
    limit ${MAX_RBAC_OVERRIDE_ROWS}
  `) as unknown as Array<{ permission: unknown; role: unknown; allowed: unknown; updated_at: unknown }>;

  const out: Array<{ permission: Permission; role: Role; allowed: boolean; updated_at: string }> = [];
  for (const row of rows) {
    const permission = normalizePermission(row.permission);
    const role = normalizeRole(row.role);
    if (!permission || !role || typeof row.allowed !== "boolean") continue;
    out.push({
      permission,
      role,
      allowed: row.allowed,
      updated_at: String(row.updated_at ?? ""),
    });
  }
  return out;
}

export async function upsertRolePermissionOverride(args: {
  permission: Permission;
  role: Role;
  allowed: boolean;
}): Promise<void> {
  const permission = normalizePermission(args?.permission);
  const role = normalizeRole(args?.role);
  if (!permission || !role || typeof args?.allowed !== "boolean") {
    throw new Error("INVALID_RBAC_OVERRIDE");
  }
  if (!(await permissionsTableExists())) throw new Error("RBAC_TABLE_MISSING");
  await sql`
    insert into public.role_permissions (permission, role, allowed, updated_at)
    values (${permission}::text, ${role}::text, ${args.allowed}, now())
    on conflict (permission, role)
    do update set
      allowed = excluded.allowed,
      updated_at = now()
  `;
}
