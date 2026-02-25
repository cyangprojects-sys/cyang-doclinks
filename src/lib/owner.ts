import { getAuthedUser, roleAtLeast } from "@/lib/authz";

// Legacy name used by some API routes.
// Now: "admin" means owner/admin.
export async function requireOwner() {
  const u = await getAuthedUser();
  if (!u) return { ok: false as const, reason: "UNAUTHENTICATED" as const };
  if (!roleAtLeast(u.role, "admin")) {
    return { ok: false as const, reason: "FORBIDDEN" as const };
  }
  return { ok: true as const, user: u };
}
