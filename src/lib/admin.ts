// src/lib/admin.ts
// Back-compat helpers used by existing pages/actions.

import { getAuthedUser, getOwnerEmail as _getOwnerEmail, roleAtLeast, type Role } from "@/lib/authz";

export async function getOwnerEmail(): Promise<string> {
  return _getOwnerEmail();
}

// Historically: "owner" only. Now: owner/admin.
export async function isOwnerAdmin(): Promise<boolean> {
  const u = await getAuthedUser();
  if (!u) return false;
  return roleAtLeast(u.role, "admin");
}

// Throws on fail (use inside Server Actions / routes)
export async function requireOwnerAdmin(): Promise<string> {
  const u = await getAuthedUser();
  if (!u) throw new Error("Unauthorized.");
  if (!roleAtLeast(u.role, "admin")) throw new Error("Forbidden.");
  return u.email;
}

export async function getRole(): Promise<Role | null> {
  const u = await getAuthedUser();
  return u?.role ?? null;
}
