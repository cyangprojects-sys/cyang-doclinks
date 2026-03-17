import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { ensureUserByEmail } from "@/lib/authz";
import ViewerShell from "./_components/ViewerShell";
import { getViewerShellContext } from "./_components/viewerShellData";

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

  const shellContext = await getViewerShellContext({
    userId: user.id,
    orgId,
    orgSlug,
  });

  return (
    <ViewerShell email={session.user.email} context={shellContext}>
      {children}
    </ViewerShell>
  );
}
