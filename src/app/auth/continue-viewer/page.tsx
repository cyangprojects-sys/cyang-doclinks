import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { ensureUserByEmail } from "@/lib/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PostSignInViewerContinuePage() {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || "").trim().toLowerCase();
  if (!email) redirect("/signin");

  const orgId = (session?.user as { orgId?: string | null } | undefined)?.orgId ?? null;
  const orgSlug = (session?.user as { orgSlug?: string | null } | undefined)?.orgSlug ?? null;
  let user: Awaited<ReturnType<typeof ensureUserByEmail>> | null = null;

  try {
    user = await ensureUserByEmail(email, { orgId, orgSlug });
  } catch {
    // Fall through to the viewer-safe surface.
  }

  if (user && (user.role === "admin" || user.role === "owner")) {
    redirect("/admin");
  }

  redirect("/viewer");
}
