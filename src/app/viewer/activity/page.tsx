import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import DashboardHeaderActions from "@/app/admin/dashboard/DashboardHeaderActions";
import ViewsByDocTableClient from "@/app/admin/dashboard/ViewsByDocTableClient";
import { getDashboardActivityPageData } from "@/app/admin/dashboard/data";

export const runtime = "nodejs";

function fmtInt(n: number) {
  try {
    return new Intl.NumberFormat().format(n);
  } catch {
    return String(n);
  }
}

function fmtDateTime(s: string | null): string {
  if (!s) return "No activity yet";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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

  const { activityData, homeData, snapshotGeneratedAt } = await getDashboardActivityPageData(user);
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

      <section className="surface-panel-strong p-6 sm:p-7">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_minmax(0,0.8fr)]">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-[var(--accent-primary)]">Insights</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              See which files are getting attention and when people open them.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
              This view keeps activity understandable: what has been opened, how often, and which files are getting the most engagement.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/viewer/documents" className="btn-base btn-secondary rounded-sm px-4 py-3 text-sm">
                Open files
              </Link>
              <Link href="/viewer/links" className="btn-base btn-secondary rounded-sm px-4 py-3 text-sm">
                Manage shared links
              </Link>
            </div>
            <div className="mt-4 text-[11px] uppercase tracking-[0.16em] text-[var(--text-faint)]">
              Snapshot updated {fmtDateTime(new Date(snapshotGeneratedAt).toISOString())}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="selection-tile p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Total views</div>
              <div className="mt-2 text-2xl font-semibold text-slate-950">{fmtInt(totalViews)}</div>
              <div className="mt-1 text-sm text-[var(--text-secondary)]">Across every file with activity.</div>
            </div>
            <div className="selection-tile p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Files with views</div>
              <div className="mt-2 text-2xl font-semibold text-slate-950">{fmtInt(activeFiles)}</div>
              <div className="mt-1 text-sm text-[var(--text-secondary)]">Files that have been opened at least once.</div>
            </div>
            <div className="selection-tile p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Recent activity</div>
              <div className="mt-2 text-2xl font-semibold text-slate-950">{fmtInt(recentFiles)}</div>
              <div className="mt-1 text-sm text-[var(--text-secondary)]">Files with a recorded latest view.</div>
            </div>
          </div>
        </div>
      </section>

      {activityData.missingCoreTables ? (
        <div className="surface-panel p-4 text-sm text-[var(--text-secondary)]">
          <div className="font-medium text-slate-950">Insights unavailable</div>
          <div className="mt-1 text-[var(--text-secondary)]">The required view-tracking tables are missing.</div>
        </div>
      ) : (
        <ViewsByDocTableClient rows={activityData.viewsRows} canManageShares={activityData.canSeeAll} basePath="/viewer" />
      )}
    </div>
  );
}
