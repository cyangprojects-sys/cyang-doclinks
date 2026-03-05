import { getAuthedUser, roleAtLeast } from "@/lib/authz";

function normalizeRole(value: unknown): "viewer" | "admin" | "owner" | null {
  const role = String(value || "").trim().toLowerCase();
  if (role === "viewer" || role === "admin" || role === "owner") return role;
  return null;
}

// Legacy name used by some API routes.
// Now: "admin" means owner/admin.
export async function requireOwner() {
  const u = await getAuthedUser();
  if (!u) return { ok: false as const, reason: "UNAUTHENTICATED" as const };
  const role = normalizeRole(u.role);
  if (!role || !roleAtLeast(role, "admin")) {
    return { ok: false as const, reason: "FORBIDDEN" as const };
  }
  return { ok: true as const, user: u };
}
