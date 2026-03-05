import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import AdminShell from "./_components/AdminShell";
import { getBillingFlags } from "@/lib/settings";
import { hasValidMfaCookie, roleRequiresMfa } from "@/lib/mfa";
import { ensureUserByEmail } from "@/lib/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdminRole = "viewer" | "admin" | "owner";

function isAdminRole(role: string | undefined): role is AdminRole {
  return role === "viewer" || role === "admin" || role === "owner";
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  // Require login for all /admin routes
  if (!session?.user) redirect("/signin");

  const rawRole = (session.user as { role?: string })?.role;
  if (!isAdminRole(rawRole)) redirect("/signin");
  const role = rawRole;
  const isOwner = role === "owner";
  const email = String(session.user.email || "").trim().toLowerCase();
  const orgId = (session.user as { orgId?: string | null } | undefined)?.orgId ?? null;
  const orgSlug = (session.user as { orgSlug?: string | null } | undefined)?.orgSlug ?? null;
  if ((role === "admin" || role === "owner") && email && roleRequiresMfa(role)) {
    const user = await ensureUserByEmail(email, { orgId, orgSlug });
    const ok = await hasValidMfaCookie({ userId: user.id, email: user.email, role: user.role });
    if (!ok) redirect("/mfa?next=/admin/dashboard");
  }
  const billingFlags = await getBillingFlags();

  return (
    <AdminShell email={session.user.email} isOwner={isOwner} showPricingUi={billingFlags.flags.pricingUiEnabled}>
      {children}
    </AdminShell>
  );
}
