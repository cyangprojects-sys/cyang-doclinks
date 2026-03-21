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

      <section className="surface-panel-strong overflow-hidden p-6 sm:p-7">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_minmax(0,0.8fr)]">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-[var(--accent-primary)]">Shared links</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)] sm:text-4xl">
              Manage every protected link from one calm, clear place.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
              See what is active, what is expiring, which links are password protected, and what to copy or adjust next.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/viewer/documents" className="btn-base btn-secondary rounded-sm px-4 py-3 text-sm">
                Open files
              </Link>
              <Link href="/viewer?openPicker=1" className="btn-base btn-secondary rounded-sm px-4 py-3 text-sm">
                Upload file
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="selection-tile p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Active</div>
              <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">{active}</div>
              <div className="mt-1 text-sm text-[var(--text-muted)]">Links people can still open.</div>
            </div>
            <div className="selection-tile p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Expiring soon</div>
              <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">{expiring}</div>
              <div className="mt-1 text-sm text-[var(--text-muted)]">Worth checking before access ends.</div>
            </div>
            <div className="selection-tile p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Password protected</div>
              <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">{protectedCount}</div>
              <div className="mt-1 text-sm text-[var(--text-muted)]">Extra protection added to the link itself.</div>
            </div>
          </div>
        </div>
      </section>

      {linksData.missingCoreTables ? (
        <div className="surface-panel rounded-sm p-4 text-sm text-[var(--text-secondary)]">
          <div className="font-medium text-[var(--text-primary)]">Shared links unavailable</div>
          <div className="mt-1 text-[var(--text-muted)]">The required sharing tables are missing.</div>
        </div>
      ) : (
        <SharesTableClient shares={linksData.shares} nowTs={linksData.nowTs} canManageBulk={linksData.canSeeAll} basePath="/viewer" />
      )}
    </div>
  );
}
