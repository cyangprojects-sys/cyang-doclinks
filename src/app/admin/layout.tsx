import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import AdminShell from "./_components/AdminShell";
import { getBillingFlags } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  // Require login for all /admin routes
  if (!session?.user) redirect("/signin");

  const role = (session.user as { role?: string })?.role;
  const isOwner = role === "owner";
  const billingFlags = await getBillingFlags();

  return (
    <AdminShell email={session.user.email} isOwner={isOwner} showPricingUi={billingFlags.flags.pricingUiEnabled}>
      {children}
    </AdminShell>
  );
}
