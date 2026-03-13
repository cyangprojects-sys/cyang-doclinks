import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { ensureUserByEmail } from "@/lib/authz";
import { hasValidMfaCookie, roleRequiresMfa } from "@/lib/mfa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OwnerAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/signin");

  const email = String(session.user.email || "").trim().toLowerCase();
  if (!email) redirect("/signin");
  const orgId = (session.user as { orgId?: string | null } | undefined)?.orgId ?? null;
  const orgSlug = (session.user as { orgSlug?: string | null } | undefined)?.orgSlug ?? null;
  const user = await ensureUserByEmail(email, { orgId, orgSlug });

  // Hard gate all (owner) routes.
  if (user.role !== "owner") redirect("/admin");
  if (roleRequiresMfa("owner")) {
    const ok = await hasValidMfaCookie({ userId: user.id, email: user.email, role: user.role });
    if (!ok) redirect("/mfa?next=/admin");
  }

  // IMPORTANT: Do NOT render AdminTopNav here.
  // /admin/layout.tsx already renders the shared header.
  // Rendering it again causes a duplicated header.
  return <>{children}</>;
}
