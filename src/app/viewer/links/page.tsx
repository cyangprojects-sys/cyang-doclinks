import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import DashboardHeaderActions from "@/app/admin/dashboard/DashboardHeaderActions";
import SharesTableClient from "@/app/admin/dashboard/SharesTableClient";
import { getDashboardLinksData, getDashboardHomeData } from "@/app/admin/dashboard/data";

export const runtime = "nodejs";

export default async function ViewerLinksPage() {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/signin");
  }

  if (user.role === "admin" || user.role === "owner") {
    redirect("/admin/links");
  }

  const [linksData, homeData] = await Promise.all([getDashboardLinksData(user), getDashboardHomeData(user)]);
  const active = linksData.shares.filter((share) => {
    if (share.revoked_at) return false;
    if (share.expires_at && new Date(share.expires_at).getTime() <= linksData.nowTs) return false;
    if (share.max_views != null && share.max_views !== 0 && share.view_count >= share.max_views) return false;
    return true;
  }).length;
  const expiring = linksData.shares.filter((share) => {
    if (share.revoked_at || !share.expires_at) return false;
    const ts = new Date(share.expires_at).getTime();
    if (Number.isNaN(ts) || ts <= linksData.nowTs) return false;
    return ts <= linksData.nowTs + 7 * 24 * 60 * 60 * 1000;
  }).length;
  const protectedCount = linksData.shares.filter((share) => share.has_password).length;

  return (
    <div className="space-y-6">
      <DashboardHeaderActions
        docs={homeData.headerDocs}
        planId={linksData.planId}
        mode="modal-only"
        uploadPickerHref="/viewer/documents?openPicker=1"
        createLinkFallbackHref="/viewer/documents?openPicker=1&fromCreateLink=1"
        upgradeHref="/pricing"
      />

      <section className="glass-card-strong ui-sheen rounded-[32px] p-6 sm:p-7">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_minmax(0,0.8fr)]">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-cyan-200/70">Shared links</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Manage every protected link from one calm, clear place.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/68 sm:text-base">
              See what is active, what is expiring, which links are password protected, and what to copy or adjust next.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/viewer/documents" className="btn-base btn-secondary rounded-2xl px-4 py-3 text-sm">
                Open files
              </Link>
              <Link href="/viewer?openPicker=1" className="btn-base btn-secondary rounded-2xl px-4 py-3 text-sm">
                Upload file
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-white/45">Active</div>
              <div className="mt-2 text-2xl font-semibold text-white">{active}</div>
              <div className="mt-1 text-sm text-white/60">Links people can still open.</div>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-white/45">Expiring soon</div>
              <div className="mt-2 text-2xl font-semibold text-white">{expiring}</div>
              <div className="mt-1 text-sm text-white/60">Worth checking before access ends.</div>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-white/45">Password protected</div>
              <div className="mt-2 text-2xl font-semibold text-white">{protectedCount}</div>
              <div className="mt-1 text-sm text-white/60">Extra protection added to the link itself.</div>
            </div>
          </div>
        </div>
      </section>

      {linksData.missingCoreTables ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-300">
          <div className="font-medium text-neutral-100">Shared links unavailable</div>
          <div className="mt-1 text-neutral-400">The required sharing tables are missing.</div>
        </div>
      ) : (
        <SharesTableClient shares={linksData.shares} nowTs={linksData.nowTs} canManageBulk={linksData.canSeeAll} basePath="/viewer" />
      )}
    </div>
  );
}
