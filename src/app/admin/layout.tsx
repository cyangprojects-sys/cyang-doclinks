import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import AdminShell from "./_components/AdminShell";
import { getBillingFlags } from "@/lib/settings";
import { hasValidMfaCookie, roleRequiresMfa } from "@/lib/mfa";
import { ensureUserByEmail } from "@/lib/authz";
import { getAdminShellContext } from "./_components/adminShellData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdminRole = "admin" | "owner";

function isAdminRole(role: string): role is AdminRole {
  return role === "admin" || role === "owner";
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  // Require login for all /admin routes
  if (!session?.user) redirect("/signin");

  const email = String(session.user.email || "").trim().toLowerCase();
  if (!email) redirect("/signin");
  const orgId = (session.user as { orgId?: string | null } | undefined)?.orgId ?? null;
  const orgSlug = (session.user as { orgSlug?: string | null } | undefined)?.orgSlug ?? null;
  const user = await ensureUserByEmail(email, { orgId, orgSlug });
  if (!isAdminRole(user.role)) redirect("/viewer");

  const role = user.role;
  const isOwner = role === "owner";
  const ensuredUserId = user.id;
  if (roleRequiresMfa(role)) {
    const ok = await hasValidMfaCookie({ userId: user.id, email: user.email, role: user.role });
    if (!ok) redirect("/mfa?next=/admin");
  }
  const billingFlags = await getBillingFlags();
  const shellContext = await getAdminShellContext({
    userId: ensuredUserId,
    email: session.user.email,
    orgId,
    orgSlug,
    isOwner,
  });

  return (
    <AdminShell
      email={session.user.email}
      isOwner={isOwner}
      showPricingUi={billingFlags.flags.pricingUiEnabled}
      context={shellContext}
    >
      {children}
    </AdminShell>
  );
}
