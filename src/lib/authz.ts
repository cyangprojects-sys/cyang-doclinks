// src/lib/authz.ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { sql } from "@/lib/db";

export type Role = "viewer" | "admin" | "owner";

export type AuthedUser = {
  id: string;
  email: string;
  role: Role;
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
 * Ensure a row exists in public.users for this email and return {id,email,role}.
 * - Default role: viewer
 * - If email matches OWNER_EMAIL: role forced to owner (never downgraded)
 * - Existing admin/owner roles are never downgraded by sign-in.
 */
export async function ensureUserByEmail(emailRaw: string): Promise<AuthedUser> {
  const email = normEmail(emailRaw);
  if (!email) throw new Error("UNAUTHENTICATED");

  const ownerEmail = ownerEmailFromEnv();
  const desiredRole: Role = ownerEmail && email === ownerEmail ? "owner" : "viewer";

  try {
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

    // Defensive: if OWNER_EMAIL matches, guarantee role owner.
    if (desiredRole === "owner" && u.role !== "owner") {
      const rows2 = (await sql`
        update public.users
        set role = 'owner'
        where id = ${u.id}::uuid
        returning id::text as id, email, role
      `) as unknown as Array<{ id: string; email: string; role: Role }>;
      const u2 = rows2?.[0];
      if (u2?.id) return u2;
    }

    return u;
  } catch (e: any) {
    const msg = String(e?.message || "").toLowerCase();

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
 */
export async function getAuthedUser(): Promise<AuthedUser | null> {
  const session = (await getServerSession(authOptions)) as any;
  const email = normEmail(session?.user?.email || "");
  if (!email) return null;
  return ensureUserByEmail(email);
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
  if (roleRank(u.role) < roleRank(minRole)) throw new Error("FORBIDDEN");
  return u;
}

/**
 * Require permission to write/manage a doc.
 * - owner/admin can write any doc
 * - viewer can write only docs they own (docs.owner_id)
 *
 * Back-compat: if docs.owner_id doesn't exist yet, viewers are forbidden and
 * admins/owners are allowed.
 */
export async function requireDocWrite(docIdRaw: string): Promise<void> {
  const docId = String(docIdRaw || "").trim();
  if (!docId) throw new Error("Missing docId.");

  const u = await requireUser();
  if (u.role === "owner" || u.role === "admin") return;

  try {
    const rows = (await sql`
      select owner_id::text as owner_id
      from public.docs
      where id = ${docId}::uuid
      limit 1
    `) as unknown as Array<{ owner_id: string | null }>;

    const ownerId = rows?.[0]?.owner_id ?? null;
    if (!ownerId) throw new Error("Doc not found.");
    if (ownerId !== u.id) throw new Error("FORBIDDEN");
    return;
  } catch (e: any) {
    const msg = String(e?.message || "").toLowerCase();
    const missingOwnerIdCol =
      msg.includes("column") && msg.includes("owner_id") && msg.includes("does not exist");

    if (missingOwnerIdCol) {
      throw new Error("FORBIDDEN (docs.owner_id missing — run scripts/sql/user_ownership_layer.sql)");
    }

    throw e;
  }
}
