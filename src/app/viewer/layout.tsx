import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { ensureUserByEmail } from "@/lib/authz";
import ViewerSignOutButton from "./ViewerSignOutButton";

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

  return (
    <main className="app-shell min-h-screen px-4 py-6 text-white sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-[1280px]">
        <header className="glass-card-strong ui-sheen sticky top-2 z-40 rounded-[28px] border-white/14 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-white/52">DocLinks</div>
              <div className="mt-1 flex items-center gap-2">
                <h1 className="text-xl font-semibold text-white sm:text-2xl">Member workspace</h1>
                <span className="rounded-full border border-white/14 bg-white/[0.05] px-2.5 py-1 text-[11px] uppercase tracking-[0.13em] text-cyan-100">
                  Member
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href="/signin?intent=admin"
                className="btn-base rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-2 text-sm text-white/78 hover:border-white/22 hover:bg-white/[0.08]"
              >
                Workspace owner sign-in
              </Link>
              <ViewerSignOutButton />
            </div>
          </div>
        </header>

        <div className="mt-5">{children}</div>
      </div>
    </main>
  );
}
