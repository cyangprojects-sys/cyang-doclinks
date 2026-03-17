import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import DashboardHeaderActions from "@/app/admin/dashboard/DashboardHeaderActions";
import UploadPanel from "@/app/admin/dashboard/UploadPanel";
import {
  getDashboardOverviewData,
} from "@/app/admin/dashboard/data";
import { getShareEligibility, normalizeScanState } from "@/lib/documentStatus";

export const runtime = "nodejs";

function fmtDateTime(s: string | null): string {
  if (!s) return "No activity yet";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtInt(n: number): string {
  try {
    return new Intl.NumberFormat().format(n);
  } catch {
    return String(n);
  }
}

function countActiveShares(
  shares: Array<{ expires_at: string | null; revoked_at: string | null; max_views: number | null; view_count: number }>
) {
  const now = Date.now();
  return shares.filter((share) => {
    if (share.revoked_at) return false;
    if (share.expires_at && new Date(share.expires_at).getTime() <= now) return false;
    if (share.max_views != null && share.max_views !== 0 && share.view_count >= share.max_views) return false;
    return true;
  }).length;
}

export default async function ViewerOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ openPicker?: string; fromCreateLink?: string }>;
}) {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/signin");
  }

  if (user.role === "admin" || user.role === "owner") {
    redirect("/admin");
  }

  const [params, overview] = await Promise.all([searchParams, getDashboardOverviewData(user)]);
  const { homeData, docsData, linksData, activityData } = overview;

  const headerDocs = homeData.headerDocs;
  const autoOpenPicker = String(params?.openPicker || "") === "1";
  const fromCreateLink = String(params?.fromCreateLink || "") === "1";
  const readyDocs = docsData.unifiedRows.filter((row) => {
    const share = getShareEligibility({
      docStateRaw: row.doc_state,
      scanStateRaw: row.scan_status,
      moderationStatusRaw: row.moderation_status,
    });
    return share.canCreateLink && normalizeScanState(row.scan_status, row.moderation_status) === "CLEAN";
  });
  const readyWithoutLinks = readyDocs.filter((row) => row.active_shares === 0).slice(0, 3);
  const waitingDocs = docsData.unifiedRows.filter((row) => {
    const scan = normalizeScanState(row.scan_status, row.moderation_status);
    return scan === "PENDING" || scan === "RUNNING" || scan === "NOT_SCHEDULED";
  });
  const latestLinks = linksData.shares.slice(0, 3);
  const activeLinkCount = countActiveShares(linksData.shares);
  const totalViews = activityData.viewsRows.reduce((sum, row) => sum + (row.views || 0), 0);
  const activeFilesWithViews = activityData.viewsRows.filter((row) => row.views > 0).length;
  const planLabel = homeData.planId === "pro" ? "Pro" : "Free";

  return (
    <div className="space-y-6">
      <DashboardHeaderActions
        docs={headerDocs}
        planId={homeData.planId}
        mode="modal-only"
        uploadPickerHref="/viewer?openPicker=1"
        createLinkFallbackHref="/viewer?openPicker=1&fromCreateLink=1"
        upgradeHref="/pricing"
      />

      <section className="glass-card-strong ui-sheen overflow-hidden rounded-[32px] p-6 sm:p-7">
        <div className="grid gap-6 xl:grid-cols-[1.25fr_minmax(0,0.85fr)]">
          <div className="space-y-5">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-cyan-200/70">Overview</div>
              <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Secure sharing that feels obvious from the first file.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/68 sm:text-base">
                Upload a file, wait for the scan, create a protected link, and come back here to see what is ready, active, or viewed.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/viewer?openPicker=1"
                className="btn-base rounded-2xl border border-cyan-300/45 bg-cyan-300 px-5 py-3 text-sm font-semibold text-[#07131f] shadow-[0_14px_32px_rgba(34,211,238,0.18)] hover:bg-cyan-200"
              >
                Upload documents
              </Link>
              <Link href="/viewer/documents" className="btn-base btn-secondary rounded-2xl px-4 py-3 text-sm">
                Open documents
              </Link>
              <Link href="/viewer/links" className="btn-base btn-secondary rounded-2xl px-4 py-3 text-sm">
                Manage links
              </Link>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-white/45">Step 1</div>
                <div className="mt-2 text-base font-semibold text-white">Upload</div>
                <div className="mt-1 text-sm text-white/60">Start with the file you want to share.</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-white/45">Step 2</div>
                <div className="mt-2 text-base font-semibold text-white">Protect</div>
                <div className="mt-1 text-sm text-white/60">Sharing unlocks after the scan is complete.</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-white/45">Step 3</div>
                <div className="mt-2 text-base font-semibold text-white">Share and track</div>
                <div className="mt-1 text-sm text-white/60">Copy the link and check views later.</div>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-white/45">At a glance</div>
            <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-white/38">
              Snapshot updated {fmtDateTime(new Date(overview.snapshotGeneratedAt).toISOString())}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs text-white/45">Documents</div>
                <div className="mt-2 text-2xl font-semibold text-white">{fmtInt(docsData.unifiedRows.length)}</div>
                <div className="mt-1 text-sm text-white/60">in your secure library</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs text-white/45">Ready to share</div>
                <div className="mt-2 text-2xl font-semibold text-white">{fmtInt(readyDocs.length)}</div>
                <div className="mt-1 text-sm text-white/60">scan complete</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs text-white/45">Active links</div>
                <div className="mt-2 text-2xl font-semibold text-white">{fmtInt(activeLinkCount)}</div>
                <div className="mt-1 text-sm text-white/60">currently available to recipients</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs text-white/45">Views</div>
                <div className="mt-2 text-2xl font-semibold text-white">{fmtInt(totalViews)}</div>
                <div className="mt-1 text-sm text-white/60">across {fmtInt(activeFilesWithViews)} documents</div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-cyan-300/18 bg-cyan-400/[0.08] p-4">
              <div className="text-sm font-medium text-white">Workspace plan: {planLabel}</div>
              <div className="mt-1 text-sm text-white/65">
                {homeData.planId === "pro"
                  ? "You have access to higher limits and stronger sharing controls."
                  : "Upgrade when you want more room, stricter presets, and richer insight."}
              </div>
              {homeData.planId !== "pro" ? (
                <Link href="/pricing" className="btn-base btn-secondary mt-3 inline-flex rounded-xl px-3 py-2 text-sm">
                  Review plan
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[30px] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-white/45">Start here</div>
            <h2 className="mt-2 text-xl font-semibold text-white">Upload a document</h2>
            <p className="mt-2 max-w-2xl text-sm text-white/65">
              Upload is the first step. The scan runs automatically, and the documents page will guide you when a link is ready to create.
            </p>
          </div>
          {fromCreateLink ? (
            <div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
              Upload a document first, then create its protected link from Documents.
            </div>
          ) : null}
        </div>
        <UploadPanel canCheckEncryptionStatus={homeData.canCheckEncryptionStatus} autoOpenPicker={autoOpenPicker} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_minmax(0,0.8fr)]">
        <div className="glass-card-strong rounded-[28px] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-white/45">Next best action</div>
              <h2 className="mt-2 text-xl font-semibold text-white">Documents that are ready to share</h2>
            </div>
            <Link href="/viewer/documents" className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
              Open documents
            </Link>
          </div>

          {docsData.unifiedRows.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-white/16 bg-white/[0.03] p-6 text-center">
              <div className="text-lg font-semibold text-white">Your workspace is ready for the first document.</div>
              <div className="mt-2 text-sm text-white/65">
                Upload one document and DocLinks will guide you from scan to protected sharing.
              </div>
            </div>
          ) : readyWithoutLinks.length > 0 ? (
            <div className="mt-4 space-y-3">
              {readyWithoutLinks.map((row) => (
                <div key={row.doc_id} className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.07] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-white">{row.doc_title || "Untitled document"}</div>
                      <div className="mt-1 text-sm text-emerald-100/80">Scan complete. Ready for its first protected link.</div>
                    </div>
                    <Link
                      href={`/viewer/documents?createLink=1&docId=${encodeURIComponent(row.doc_id)}`}
                      className="btn-base rounded-xl border border-emerald-300/45 bg-emerald-300 px-4 py-2 text-sm font-semibold text-[#082012] hover:bg-emerald-200"
                    >
                      Create protected link
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="text-sm font-medium text-white">No documents are waiting on link creation right now.</div>
              <div className="mt-1 text-sm text-white/65">
                {waitingDocs.length > 0
                  ? `${fmtInt(waitingDocs.length)} document${waitingDocs.length === 1 ? "" : "s"} are still waiting for the scan to finish.`
                  : "Your ready documents already have links, or you can upload another document to share."}
              </div>
            </div>
          )}
        </div>

        <div className="glass-card-strong rounded-[28px] p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-white/45">Protection status</div>
          <h2 className="mt-2 text-xl font-semibold text-white">What is safe to share</h2>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.07] p-4">
              <div className="text-sm font-medium text-white">Ready to share</div>
              <div className="mt-1 text-sm text-emerald-100/80">Documents marked Ready have completed their scan.</div>
            </div>
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] p-4">
              <div className="text-sm font-medium text-white">Waiting for scan</div>
              <div className="mt-1 text-sm text-amber-100/80">Sharing stays unavailable until the scan finishes.</div>
            </div>
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] p-4">
              <div className="text-sm font-medium text-white">Blocked for safety</div>
              <div className="mt-1 text-sm text-rose-100/80">Flagged documents remain blocked so they cannot be shared accidentally.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_minmax(0,1fr)]">
        <div className="glass-card-strong rounded-[28px] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-white/45">Latest protected links</div>
              <h2 className="mt-2 text-xl font-semibold text-white">Links you can manage right away</h2>
            </div>
            <Link href="/viewer/links" className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
              Open links
            </Link>
          </div>

          {latestLinks.length > 0 ? (
            <div className="mt-4 space-y-3">
              {latestLinks.map((share) => (
                <div key={share.token} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-white">{share.doc_title || "Untitled document"}</div>
                      <div className="mt-1 text-sm text-white/65">
                        {share.to_email ? `Shared with ${share.to_email}` : "Protected link ready to copy"} · Created {fmtDateTime(share.created_at)}
                      </div>
                    </div>
                    <Link href={`/viewer/links/${encodeURIComponent(share.token)}`} className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
                      Manage
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
              No protected links yet. Upload a document, then create its first protected link from Documents.
            </div>
          )}
        </div>

        <div className="glass-card-strong rounded-[28px] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-white/45">Recent views</div>
              <h2 className="mt-2 text-xl font-semibold text-white">Where people are engaging</h2>
            </div>
            <Link href="/viewer/activity" className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
              Open activity
            </Link>
          </div>

          {activityData.viewsRows.slice(0, 3).length > 0 ? (
            <div className="mt-4 space-y-3">
              {activityData.viewsRows.slice(0, 3).map((row) => (
                <div key={row.doc_id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-white">{row.doc_title || "Untitled document"}</div>
                      <div className="mt-1 text-sm text-white/65">
                        {fmtInt(row.views)} views · {fmtInt(row.unique_ips)} unique visitors · Last opened {fmtDateTime(row.last_view)}
                      </div>
                    </div>
                    <Link href={`/viewer/activity?viewQ=${encodeURIComponent(row.doc_title || row.doc_id)}`} className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
                      View details
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
              No one has opened a shared document yet. Once someone views a link, you will see it here.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
