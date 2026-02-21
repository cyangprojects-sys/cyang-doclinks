import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import AdminTopNav from "../_components/AdminTopNav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OwnerAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/signin");

  // Your app appears to attach role to session user; keep this defensive.
  const role = (session.user as any)?.role as string | undefined;
  const isOwner = role === "owner";

  return (
    <div className="min-h-screen">
      <AdminTopNav email={session.user.email} isOwner={isOwner} />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
