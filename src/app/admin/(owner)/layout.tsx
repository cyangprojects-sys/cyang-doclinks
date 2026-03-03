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

  // Hard gate all (owner) routes.
  const role = (session.user as { role?: string })?.role;
  const isOwner = role === "owner";
  if (!isOwner) redirect("/admin/dashboard");
  const email = String(session.user.email || "").trim().toLowerCase();
  const orgId = (session.user as { orgId?: string | null } | undefined)?.orgId ?? null;
  const orgSlug = (session.user as { orgSlug?: string | null } | undefined)?.orgSlug ?? null;
  if (email && roleRequiresMfa("owner")) {
    const user = await ensureUserByEmail(email, { orgId, orgSlug });
    const ok = await hasValidMfaCookie({ userId: user.id, email: user.email, role: user.role });
    if (!ok) redirect("/mfa?next=/admin/dashboard");
  }

  // IMPORTANT: Do NOT render AdminTopNav here.
  // /admin/layout.tsx already renders the shared header.
  // Rendering it again causes a duplicated header.
  return <>{children}</>;
}
