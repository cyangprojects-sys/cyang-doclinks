import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { ensureUserByEmail } from "@/lib/authz";
import { getBillingFlags } from "@/lib/settings";
import AdminShell from "@/app/admin/_components/AdminShell";
import { ADMIN_NAV_ITEMS, type AdminNavItem } from "@/app/admin/_components/adminNavigation";
import { getAdminShellContext } from "@/app/admin/_components/adminShellData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ViewerLayout({
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

  let user: Awaited<ReturnType<typeof ensureUserByEmail>>;
  try {
    user = await ensureUserByEmail(email, { orgId, orgSlug });
  } catch {
    redirect("/signin?error=AccessDenied");
  }

  if (user.role === "admin" || user.role === "owner") {
    redirect("/admin");
  }

  const billingFlags = await getBillingFlags();
  const shellContext = await getAdminShellContext({
    userId: user.id,
    email: session.user.email,
    orgId,
    orgSlug,
    isOwner: false,
    requestedBadges: ["documents", "links"],
  });
  const viewerNavItems: AdminNavItem[] = ADMIN_NAV_ITEMS.filter((item) =>
    item.key === "overview" ||
    item.key === "documents" ||
    item.key === "links" ||
    item.key === "activity"
  ).map((item) => ({
    ...item,
    href: item.href.replace(/^\/admin\b/, "/viewer"),
  }));
  const viewerContext = {
    ...shellContext,
    workspaceLabel: "Member workspace",
    roleLabel: "Member",
  };

  return (
    <AdminShell
      email={session.user.email}
      isOwner={false}
      showPricingUi={billingFlags.flags.pricingUiEnabled}
      context={viewerContext}
      routeBase="/viewer"
      navItems={viewerNavItems}
      profileHref="/viewer"
      signOutCallbackUrl="/signin"
    >
      {children}
    </AdminShell>
  );
}
