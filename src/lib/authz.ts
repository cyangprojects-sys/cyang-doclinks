// src/lib/authz.ts
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";

import { authOptions } from "@/auth";
import { sql } from "@/lib/db";
import { ORG_COOKIE_NAME } from "@/lib/tenant";
import { getOrgBySlug } from "@/lib/orgs";

export type Role = "viewer" | "admin" | "owner";

export type AuthedUser = {
  id: string;
  email: string;
  role: Role;
  orgId: string | null;
  orgSlug: string | null;
};

function normEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

function roleRank(role: Role): number {
  switch (role) {
    case "viewer":
      return 1;
    case "admin":
      return 2;
    case "owner":
      return 3;
  }
}

function ownerEmailFromEnv(): string | null {
  const owner = normEmail(process.env.OWNER_EMAIL || "");
  return owner ? owner : null;
}

/**
 * Back-compat helper: return the configured owner email (or empty string).
 * Some older code wraps this in an async function, so this is intentionally sync.
 */
export function getOwnerEmail(): string {
  return ownerEmailFromEnv() ?? "";
}

/**
 * Back-compat helper: check if a role meets or exceeds a minimum required role.
 */
export function roleAtLeast(role: Role, minRole: Role): boolean {
  return roleRank(role) >= roleRank(minRole);
}

async function organizationsTableExists(): Promise<boolean> {
  try {
    const rows = (await sql`select to_regclass('public.organizations')::text as reg`) as unknown as Array<{ reg: string | null }>;
    return !!rows?.[0]?.reg;
  } catch {
    return false;
  }
}

let _defaultOrgId: string | null | undefined = undefined;
async function getDefaultOrgId(): Promise<string | null> {
  if (_defaultOrgId !== undefined) return _defaultOrgId;
  try {
    if (!(await organizationsTableExists())) {
      _defaultOrgId = null;
      return _defaultOrgId;
    }
    const rows = (await sql`
      select id::text as id
      from public.organizations
      where slug = 'default'
      limit 1
    `) as unknown as Array<{ id: string }>;
    _defaultOrgId = rows?.[0]?.id ?? null;
    return _defaultOrgId;
  } catch {
    _defaultOrgId = null;
    return _defaultOrgId;
  }
}

export type EnsureUserCtx = { orgId: string | null; orgSlug: string | null };

/**
 * Ensure a row exists in public.users for this email and return {id,email,role,orgId,orgSlug}.
 *
 * V3 (multi-tenant) behavior:
 * - If organizations exist and ctx.orgSlug is set, bind the user to that org.
 * - If orgId is null but orgSlug resolves, it will be set.
 * - If neither is provided and a 'default' org exists, user is bound to default.
 * - Email remains globally unique; if an existing user has a different org_id, sign-in is denied.
 *
 * Role behavior (same as V2):
 * - Default role: viewer
 * - If email matches OWNER_EMAIL: role forced to owner (never downgraded)
 */
export async function ensureUserByEmail(emailRaw: string, ctx: EnsureUserCtx): Promise<AuthedUser> {
  const email = normEmail(emailRaw);
  if (!email) throw new Error("UNAUTHENTICATED");

  const ownerEmail = ownerEmailFromEnv();
  const desiredRole: Role = ownerEmail && email === ownerEmail ? "owner" : "viewer";

  // Resolve org if possible
  let orgId = ctx.orgId ?? null;
  let orgSlug = ctx.orgSlug ?? null;

  if (!orgId && orgSlug && (await organizationsTableExists())) {
    const org = await getOrgBySlug(orgSlug);
    orgId = org?.id ?? null;
    orgSlug = org?.slug ?? orgSlug;
  }

  if (!orgId) {
    orgId = await getDefaultOrgId();
    if (orgId && !orgSlug) orgSlug = "default";
  }

  try {
    // If users table doesn't have org_id yet, keep older behavior.
    // We'll try an insert that includes org_id, and fall back if column missing.
    try {
      const rows = (await sql`
        insert into public.users (email, role, org_id)
        values (${email}, ${desiredRole}, ${orgId}::uuid)
        on conflict (email) do update
        set role =
          case
            when public.users.role = 'owner' then 'owner'
            when excluded.role = 'owner' then 'owner'
            else public.users.role
          end
        returning id::text as id, email, role, org_id::text as org_id
      `) as unknown as Array<{ id: string; email: string; role: Role; org_id: string | null }>;

      const u = rows?.[0];
      if (!u?.id) throw new Error("Failed to upsert user.");

      // Enforce org binding if org_id exists.
      if (orgId && u.org_id && u.org_id !== orgId) {
        throw new Error("ORG_MISMATCH");
      }

      // Defensive: if OWNER_EMAIL matches, guarantee role owner.
      if (desiredRole === "owner" && u.role !== "owner") {
        const rows2 = (await sql`
          update public.users
          set role = 'owner'
          where id = ${u.id}::uuid
          returning id::text as id, email, role, org_id::text as org_id
        `) as unknown as Array<{ id: string; email: string; role: Role; org_id: string | null }>;
        const u2 = rows2?.[0];
        if (u2?.id) {
          return { id: u2.id, email: u2.email, role: u2.role, orgId: u2.org_id ?? orgId, orgSlug };
        }
      }

      return { id: u.id, email: u.email, role: u.role, orgId: u.org_id ?? orgId, orgSlug };
    } catch (e: any) {
      const msg = String(e?.message || "").toLowerCase();
      const missingOrgIdCol = msg.includes("column") && msg.includes("org_id") && msg.includes("does not exist");
      if (!missingOrgIdCol) throw e;

      // Fall back to V2 schema without org_id
      const rows = (await sql`
        insert into public.users (email, role)
        values (${email}, ${desiredRole})
        on conflict (email) do update
        set role =
          case
            when public.users.role = 'owner' then 'owner'
            when excluded.role = 'owner' then 'owner'
            else public.users.role
          end
        returning id::text as id, email, role
      `) as unknown as Array<{ id: string; email: string; role: Role }>;

      const u = rows?.[0];
      if (!u?.id) throw new Error("Failed to upsert user.");
      return { id: u.id, email: u.email, role: u.role, orgId: null, orgSlug: null };
    }
  } catch (e: any) {
    const msg = String(e?.message || "").toLowerCase();

    if (msg.includes("org_mismatch")) {
      throw new Error("This email is already bound to a different organization.");
    }

    if (msg.includes("relation") && msg.includes("users") && msg.includes("does not exist")) {
      throw new Error(
        "Missing table public.users. Run scripts/sql/user_ownership_layer.sql in your database."
      );
    }
    if (msg.includes("column") && msg.includes("role") && msg.includes("does not exist")) {
      throw new Error(
        "public.users schema is missing expected columns. Re-run scripts/sql/user_ownership_layer.sql."
      );
    }

    throw e;
  }
}

/**
 * Returns the authenticated user, or null if not signed in.
 * Safe to call from server components.
 *
 * NOTE: Server components don't have access to the incoming request directly,
 * so we rely on next/headers cookies + default authOptions.
 * The NextAuth route binds org context into the JWT (orgId/orgSlug).
 */
export async function getAuthedUser(): Promise<AuthedUser | null> {
  const session = (await getServerSession(authOptions)) as any;
  const email = normEmail(session?.user?.email || "");
  if (!email) return null;

  const orgId = (session?.user as any)?.orgId ?? null;
  const orgSlug = (session?.user as any)?.orgSlug ?? null;

  return ensureUserByEmail(email, { orgId, orgSlug });
}

/**
 * Throws if not signed in, otherwise returns the authed user.
 */
export async function requireUser(): Promise<AuthedUser> {
  const u = await getAuthedUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}

/**
 * Require at least a given role. (owner >= admin >= viewer)
 * - requireRole("admin") allows admin + owner
 * - requireRole("owner") allows owner only
 */
export async function requireRole(minRole: Role): Promise<AuthedUser> {
  const u = await requireUser();
  if (!roleAtLeast(u.role, minRole)) throw new Error("FORBIDDEN");
  return u;
}

/**
 * Returns the org slug requested (cookie) if present.
 * Useful for pages that need to render /org/[slug] experiences.
 */
export async function getOrgSlugHint(): Promise<string | null> {
  try {
    // In Next.js App Router, cookies() may be async depending on version.
    const c = await cookies();
    const v = c.get(ORG_COOKIE_NAME)?.value ?? "";
    const slug = String(v || "").trim().toLowerCase();
    return slug ? slug : null;
  } catch {
    return null;
  }
}

/**
 * Require permission to write/manage a doc.
 * - owner/admin can write any doc *within their org*
 * - viewer can write only docs they own (docs.owner_id)
 *
 * Back-compat: if docs.owner_id doesn't exist yet, viewers are forbidden and
 * admins/owners are allowed.
 */
export async function requireDocWrite(docIdRaw: string): Promise<void> {
  const docId = String(docIdRaw || "").trim();
  if (!docId) throw new Error("Missing docId.");

  const u = await requireUser();
  if (u.role === "owner") {
    // Owner has full control across all documents.
    return;
  }
  if (u.role === "admin") {
    // still enforce org scope if docs.org_id exists
    try {
      const rows = (await sql`
        select org_id::text as org_id
        from public.docs
        where id = ${docId}::uuid
        limit 1
      `) as unknown as Array<{ org_id: string | null }>;
      const docOrgId = rows?.[0]?.org_id ?? null;
      if (docOrgId && u.orgId && docOrgId !== u.orgId) throw new Error("FORBIDDEN");
    } catch {
      // ignore if org_id doesn't exist
    }
    return;
  }

  try {
    const rows = (await sql`
      select owner_id::text as owner_id,
             org_id::text as org_id,
             lower(coalesce(created_by_email, ''))::text as created_by_email
      from public.docs
      where id = ${docId}::uuid
      limit 1
    `) as unknown as Array<{ owner_id: string | null; org_id: string | null; created_by_email: string }>;

    const ownerId = rows?.[0]?.owner_id ?? null;
    const docOrgId = rows?.[0]?.org_id ?? null;
    const createdByEmail = rows?.[0]?.created_by_email ?? "";

    // Legacy fallback: before owner_id was enforced, treat created_by_email as ownership signal.
    const ownsById = ownerId === u.id;
    const ownsByEmail = !ownerId && createdByEmail && createdByEmail === String(u.email || "").toLowerCase();
    if (!ownsById && !ownsByEmail) throw new Error("FORBIDDEN");
    if (docOrgId && u.orgId && docOrgId !== u.orgId) throw new Error("FORBIDDEN");
    return;
  } catch (e: any) {
    const msg = String(e?.message || "").toLowerCase();
    const missingOwnerIdCol =
      msg.includes("column") && msg.includes("owner_id") && msg.includes("does not exist");
    if (missingOwnerIdCol) {
      // Before ownership layer existed.
      throw new Error("FORBIDDEN");
    }
    throw e;
  }
}
