// src/lib/admin.ts
// Back-compat helpers used by existing pages/actions.

import { getAuthedUser, getOwnerEmail as _getOwnerEmail, roleAtLeast, type Role } from "@/lib/authz";

function normalizeEmailOrNull(value: unknown): string | null {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw.length > 320 || /[\r\n\0]/.test(raw)) return null;
  return raw;
}

function normalizeRoleOrNull(value: unknown): Role | null {
  const role = String(value || "").trim().toLowerCase();
  if (role === "owner" || role === "admin" || role === "viewer") return role;
  return null;
}

export async function getOwnerEmail(): Promise<string> {
  return normalizeEmailOrNull(_getOwnerEmail()) || "";
}

// Historically: "owner" only. Now: owner/admin.
export async function isOwnerAdmin(): Promise<boolean> {
  const u = await getAuthedUser();
  if (!u) return false;
  const role = normalizeRoleOrNull(u.role);
  if (!role) return false;
  return roleAtLeast(role, "admin");
}

// Throws on fail (use inside Server Actions / routes)
export async function requireOwnerAdmin(): Promise<string> {
  const u = await getAuthedUser();
  if (!u) throw new Error("Unauthorized.");
  const role = normalizeRoleOrNull(u.role);
  if (!role || !roleAtLeast(role, "admin")) throw new Error("Forbidden.");
  const email = normalizeEmailOrNull(u.email);
  if (!email) throw new Error("Unauthorized.");
  return email;
}

export async function getRole(): Promise<Role | null> {
  const u = await getAuthedUser();
  return normalizeRoleOrNull(u?.role);
}
