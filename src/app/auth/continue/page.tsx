import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { ensureUserByEmail } from "@/lib/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_HOME_PATH = "/admin";
const VIEWER_HOME_PATH = "/viewer";

export default async function PostSignInContinuePage() {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || "").trim().toLowerCase();
  if (!email) redirect("/signin");

  const orgId = (session?.user as { orgId?: string | null } | undefined)?.orgId ?? null;
  const orgSlug = (session?.user as { orgSlug?: string | null } | undefined)?.orgSlug ?? null;
  let user: Awaited<ReturnType<typeof ensureUserByEmail>> | null = null;

  try {
    user = await ensureUserByEmail(email, { orgId, orgSlug });
  } catch {
    // Fall through to the authenticated viewer workspace for non-admin accounts.
  }

  if (user && (user.role === "admin" || user.role === "owner")) {
    redirect(ADMIN_HOME_PATH);
  }

  redirect(VIEWER_HOME_PATH);
}
