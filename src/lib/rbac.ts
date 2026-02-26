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

async function permissionsTableExists(): Promise<boolean> {
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
  if (!(await permissionsTableExists())) return null;
  try {
    const rows = (await sql`
      select allowed::boolean as allowed
      from public.role_permissions
      where role = ${role}::text
        and permission = ${permission}::text
      limit 1
    `) as unknown as Array<{ allowed: boolean }>;
    if (!rows?.length) return null;
    return Boolean(rows[0].allowed);
  } catch {
    return null;
  }
}

export async function userHasPermission(user: AuthedUser, permission: Permission): Promise<boolean> {
  const override = await isAllowedByOverride(user.role, permission);
  if (override != null) return override;
  return roleAtLeast(user.role, DEFAULT_MIN_ROLE[permission]);
}

export async function requirePermission(permission: Permission): Promise<AuthedUser> {
  const user = await requireUser();
  const ok = await userHasPermission(user, permission);
  if (!ok) throw new Error("FORBIDDEN");
  return user;
}

