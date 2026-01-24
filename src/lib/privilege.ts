import { requireUserFromSession } from "@/lib/auth";

/**
 * Owner-only gate. Centralize privileged access here so
 * you can upgrade to admins/roles later by changing ONE file.
 */
export async function requireOwner(req: Request) {
  const user = await requireUserFromSession(req); // should throw/return 401 if not signed in
  const owner = (process.env.OWNER_EMAIL || "").trim().toLowerCase();

  // If env is missing, fail CLOSED (safe by default)
  if (!owner) {
    throw new Response("Not found", { status: 404 });
  }

  const email = (user?.email || "").trim().toLowerCase();
  if (!email || email !== owner) {
    // 404 avoids leaking that an admin area exists
    throw new Response("Not found", { status: 404 });
  }

  return user;
}
