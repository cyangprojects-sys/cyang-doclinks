import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import DashboardHeaderActions from "@/app/admin/dashboard/DashboardHeaderActions";
import SharesTableClient from "@/app/admin/dashboard/SharesTableClient";
import { getDashboardLinksData, getDashboardHomeData } from "@/app/admin/dashboard/data";

export const runtime = "nodejs";

export default async function AdminLinksPage() {
  let user;
  try {
    user = await requireRole("admin");
  } catch {
    redirect("/");
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
      <DashboardHeaderActions docs={homeData.headerDocs} planId={linksData.planId} mode="modal-only" />

      <section className="surface-panel-strong p-6 sm:p-7">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_minmax(0,0.8fr)]">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-[var(--accent-primary)]">Shared links</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Manage every protected link from one calm, clear place.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
              See what is active, what is expiring, which links are password protected, and what to copy or adjust next.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/admin/documents" className="btn-base btn-secondary rounded-sm px-4 py-3 text-sm">
                Open files
              </Link>
              <Link href="/admin?openPicker=1" className="btn-base btn-secondary rounded-sm px-4 py-3 text-sm">
                Upload file
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="selection-tile p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Active</div>
              <div className="mt-2 text-2xl font-semibold text-slate-950">{active}</div>
              <div className="mt-1 text-sm text-[var(--text-secondary)]">Links people can still open.</div>
            </div>
            <div className="selection-tile p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Expiring soon</div>
              <div className="mt-2 text-2xl font-semibold text-slate-950">{expiring}</div>
              <div className="mt-1 text-sm text-[var(--text-secondary)]">Worth checking before access ends.</div>
            </div>
            <div className="selection-tile p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Password protected</div>
              <div className="mt-2 text-2xl font-semibold text-slate-950">{protectedCount}</div>
              <div className="mt-1 text-sm text-[var(--text-secondary)]">Extra protection added to the link itself.</div>
            </div>
          </div>
        </div>
      </section>

      {linksData.missingCoreTables ? (
        <div className="surface-panel p-4 text-sm text-[var(--text-secondary)]">
          <div className="font-medium text-slate-950">Shared links unavailable</div>
          <div className="mt-1 text-[var(--text-secondary)]">The required sharing tables are missing.</div>
        </div>
      ) : (
        <SharesTableClient shares={linksData.shares} nowTs={linksData.nowTs} canManageBulk={linksData.canSeeAll} />
      )}
    </div>
  );
}
