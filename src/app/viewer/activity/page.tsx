import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import DashboardHeaderActions from "@/app/admin/dashboard/DashboardHeaderActions";
import ViewsByDocTableClient from "@/app/admin/dashboard/ViewsByDocTableClient";
import { getDashboardActivityData, getDashboardHomeData } from "@/app/admin/dashboard/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmtInt(n: number) {
  try {
    return new Intl.NumberFormat().format(n);
  } catch {
    return String(n);
  }
}

export default async function ViewerActivityPage() {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/signin");
  }

  if (user.role === "admin" || user.role === "owner") {
    redirect("/admin/activity");
  }

  const [activityData, homeData] = await Promise.all([getDashboardActivityData(user), getDashboardHomeData(user)]);
  const totalViews = activityData.viewsRows.reduce((sum, row) => sum + row.views, 0);
  const activeFiles = activityData.viewsRows.filter((row) => row.views > 0).length;
  const recentFiles = activityData.viewsRows.filter((row) => row.last_view).length;

  return (
    <div className="space-y-6">
      <DashboardHeaderActions
        docs={homeData.headerDocs}
        planId={activityData.planId}
        mode="modal-only"
        uploadPickerHref="/viewer/documents?openPicker=1"
        createLinkFallbackHref="/viewer/documents?openPicker=1&fromCreateLink=1"
        upgradeHref="/pricing"
      />

      <section className="glass-card-strong ui-sheen rounded-[32px] p-6 sm:p-7">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_minmax(0,0.8fr)]">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-cyan-200/70">Insights</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              See which files are getting attention and when people open them.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/68 sm:text-base">
              This view keeps activity understandable: what has been opened, how often, and which files are getting the most engagement.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/viewer/documents" className="btn-base btn-secondary rounded-2xl px-4 py-3 text-sm">
                Open files
              </Link>
              <Link href="/viewer/links" className="btn-base btn-secondary rounded-2xl px-4 py-3 text-sm">
                Manage shared links
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-white/45">Total views</div>
              <div className="mt-2 text-2xl font-semibold text-white">{fmtInt(totalViews)}</div>
              <div className="mt-1 text-sm text-white/60">Across every file with activity.</div>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-white/45">Files with views</div>
              <div className="mt-2 text-2xl font-semibold text-white">{fmtInt(activeFiles)}</div>
              <div className="mt-1 text-sm text-white/60">Files that have been opened at least once.</div>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-white/45">Recent activity</div>
              <div className="mt-2 text-2xl font-semibold text-white">{fmtInt(recentFiles)}</div>
              <div className="mt-1 text-sm text-white/60">Files with a recorded latest view.</div>
            </div>
          </div>
        </div>
      </section>

      {activityData.missingCoreTables ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-300">
          <div className="font-medium text-neutral-100">Insights unavailable</div>
          <div className="mt-1 text-neutral-400">The required view-tracking tables are missing.</div>
        </div>
      ) : (
        <ViewsByDocTableClient rows={activityData.viewsRows} canManageShares={activityData.canSeeAll} basePath="/viewer" />
      )}
    </div>
  );
}
