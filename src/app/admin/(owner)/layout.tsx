import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function isOwnerEmail(email: string | null | undefined): boolean {
  const owner = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
  const user = (email || "").trim().toLowerCase();
  if (!owner) return false;
  return !!user && user === owner;
}

export default async function OwnerAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    // Not signed in → go sign in, then return to admin.
    redirect("/api/auth/signin?callbackUrl=/admin/dashboard");
  }

  if (!isOwnerEmail(email)) {
    // Signed in but not owner → keep them in their normal dashboard.
    redirect("/admin/dashboard");
  }

  return <>{children}</>;
}
