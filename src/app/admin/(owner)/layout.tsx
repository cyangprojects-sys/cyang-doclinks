import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

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
  const role = (session.user as any)?.role as string | undefined;
  const isOwner = role === "owner";
  if (!isOwner) redirect("/admin/dashboard");

  // IMPORTANT: Do NOT render AdminTopNav here.
  // /admin/layout.tsx already renders the shared header.
  // Rendering it again causes a duplicated header.
  return <>{children}</>;
}
