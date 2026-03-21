import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import DashboardHeaderActions from "./DashboardHeaderActions";
import UploadPanel from "./UploadPanel";
import {
  getDashboardOverviewData,
} from "./data";
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

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ openPicker?: string; fromCreateLink?: string }>;
}) {
  let user;
  try {
    user = await requireRole("admin");
  } catch {
    redirect("/");
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
        uploadPickerHref="/admin?openPicker=1"
        createLinkFallbackHref="/admin?openPicker=1&fromCreateLink=1"
      />

      <section className="surface-panel-strong overflow-hidden p-6 sm:p-7">
        <div className="grid gap-6 xl:grid-cols-[1.25fr_minmax(0,0.85fr)]">
          <div className="space-y-5">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-[var(--accent-primary)]">Overview</div>
              <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)] sm:text-4xl">
                Secure sharing that feels obvious from the first file.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
                Upload a file, wait for the scan, create a protected link, and come back here to see what is ready, active, or viewed.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/admin?openPicker=1"
                className="btn-base btn-primary rounded-sm px-5 py-3 text-sm font-semibold"
              >
                Upload documents
              </Link>
              <Link href="/admin/documents" className="btn-base btn-secondary rounded-sm px-4 py-3 text-sm">
                Open documents
              </Link>
              <Link href="/admin/links" className="btn-base btn-secondary rounded-sm px-4 py-3 text-sm">
                Manage links
              </Link>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="selection-tile p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Step 1</div>
                <div className="mt-2 text-base font-semibold text-[var(--text-primary)]">Upload</div>
                <div className="mt-1 text-sm text-[var(--text-muted)]">Start with the file you want to share.</div>
              </div>
              <div className="selection-tile p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Step 2</div>
                <div className="mt-2 text-base font-semibold text-[var(--text-primary)]">Protect</div>
                <div className="mt-1 text-sm text-[var(--text-muted)]">Sharing unlocks after the scan is complete.</div>
              </div>
              <div className="selection-tile p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Step 3</div>
                <div className="mt-2 text-base font-semibold text-[var(--text-primary)]">Share and track</div>
                <div className="mt-1 text-sm text-[var(--text-muted)]">Copy the link and check views later.</div>
              </div>
            </div>
          </div>

          <div className="surface-panel-soft rounded-sm p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">At a glance</div>
            <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-[var(--text-faint)]">
              Snapshot updated {fmtDateTime(new Date(overview.snapshotGeneratedAt).toISOString())}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="selection-tile p-4">
                <div className="text-xs text-[var(--text-faint)]">Documents</div>
                <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">{fmtInt(docsData.unifiedRows.length)}</div>
                <div className="mt-1 text-sm text-[var(--text-muted)]">in your secure library</div>
              </div>
              <div className="selection-tile p-4">
                <div className="text-xs text-[var(--text-faint)]">Ready to share</div>
                <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">{fmtInt(readyDocs.length)}</div>
                <div className="mt-1 text-sm text-[var(--text-muted)]">scan complete</div>
              </div>
              <div className="selection-tile p-4">
                <div className="text-xs text-[var(--text-faint)]">Active links</div>
                <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">{fmtInt(activeLinkCount)}</div>
                <div className="mt-1 text-sm text-[var(--text-muted)]">currently available to recipients</div>
              </div>
              <div className="selection-tile p-4">
                <div className="text-xs text-[var(--text-faint)]">Views</div>
                <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">{fmtInt(totalViews)}</div>
                <div className="mt-1 text-sm text-[var(--text-muted)]">across {fmtInt(activeFilesWithViews)} documents</div>
              </div>
            </div>

            <div className="mt-4 rounded-sm border border-[var(--border-accent)] bg-[var(--surface-selected)] p-4">
              <div className="text-sm font-medium text-[var(--text-primary)]">Workspace plan: {planLabel}</div>
              <div className="mt-1 text-sm text-[var(--text-secondary)]">
                {homeData.planId === "pro"
                  ? "You have access to higher limits and stronger sharing controls."
                  : "Upgrade when you want more room, stricter presets, and richer insight."}
              </div>
              {homeData.planId !== "pro" ? (
                <Link href="/admin/billing?tab=plan" className="btn-base btn-secondary mt-3 inline-flex rounded-sm px-3 py-2 text-sm">
                  Review plan
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="surface-panel p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Start here</div>
            <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">Upload a document</h2>
            <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
              Upload is the first step. The scan runs automatically, and the documents page will guide you when a link is ready to create.
            </p>
          </div>
          {fromCreateLink ? (
            <div className="rounded-sm border border-[var(--border-accent)] bg-[var(--surface-selected)] px-4 py-3 text-sm text-[var(--accent-primary)]">
              Upload a document first, then create its protected link from Documents.
            </div>
          ) : null}
        </div>
        <UploadPanel canCheckEncryptionStatus={homeData.canCheckEncryptionStatus} autoOpenPicker={autoOpenPicker} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_minmax(0,0.8fr)]">
        <div className="surface-panel-strong p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Next best action</div>
              <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">Documents that are ready to share</h2>
            </div>
            <Link href="/admin/documents" className="btn-base btn-secondary rounded-sm px-3 py-2 text-sm">
              Open documents
            </Link>
          </div>

          {docsData.unifiedRows.length === 0 ? (
            <div className="surface-panel-soft mt-4 rounded-sm p-6 text-center">
              <div className="text-lg font-semibold text-[var(--text-primary)]">Your workspace is ready for the first document.</div>
              <div className="mt-2 text-sm text-[var(--text-secondary)]">
                Upload one document and DocLinks will guide you from scan to protected sharing.
              </div>
            </div>
          ) : readyWithoutLinks.length > 0 ? (
            <div className="mt-4 space-y-3">
              {readyWithoutLinks.map((row) => (
                <div key={row.doc_id} className="rounded-sm border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-[var(--text-primary)]">{row.doc_title || "Untitled document"}</div>
                      <div className="mt-1 text-sm text-emerald-700">Scan complete. Ready for its first protected link.</div>
                    </div>
                    <Link
                      href={`/admin/documents?createLink=1&docId=${encodeURIComponent(row.doc_id)}`}
                      className="btn-base btn-primary rounded-sm px-4 py-2 text-sm font-semibold"
                    >
                      Create protected link
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="selection-tile mt-4 p-4">
              <div className="text-sm font-medium text-[var(--text-primary)]">No documents are waiting on link creation right now.</div>
              <div className="mt-1 text-sm text-[var(--text-secondary)]">
                {waitingDocs.length > 0
                  ? `${fmtInt(waitingDocs.length)} document${waitingDocs.length === 1 ? "" : "s"} are still waiting for the scan to finish.`
                  : "Your ready documents already have links, or you can upload another document to share."}
              </div>
            </div>
          )}
        </div>

        <div className="surface-panel-strong p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Protection status</div>
          <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">What is safe to share</h2>
          <div className="mt-4 space-y-3">
            <div className="rounded-sm border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-sm font-medium text-[var(--text-primary)]">Ready to share</div>
              <div className="mt-1 text-sm text-emerald-700">Documents marked Ready have completed their scan.</div>
            </div>
            <div className="rounded-sm border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-medium text-[var(--text-primary)]">Waiting for scan</div>
              <div className="mt-1 text-sm text-amber-700">Sharing stays unavailable until the scan finishes.</div>
            </div>
            <div className="rounded-sm border border-rose-200 bg-rose-50 p-4">
              <div className="text-sm font-medium text-[var(--text-primary)]">Blocked for safety</div>
              <div className="mt-1 text-sm text-rose-700">Flagged documents remain blocked so they cannot be shared accidentally.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_minmax(0,1fr)]">
        <div className="surface-panel-strong p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Latest protected links</div>
              <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">Links you can manage right away</h2>
            </div>
            <Link href="/admin/links" className="btn-base btn-secondary rounded-sm px-3 py-2 text-sm">
              Open links
            </Link>
          </div>

          {latestLinks.length > 0 ? (
            <div className="mt-4 space-y-3">
              {latestLinks.map((share) => (
                <div key={share.token} className="selection-tile p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-[var(--text-primary)]">{share.doc_title || "Untitled document"}</div>
                      <div className="mt-1 text-sm text-[var(--text-secondary)]">
                        {share.to_email ? `Shared with ${share.to_email}` : "Protected link ready to copy"} · Created {fmtDateTime(share.created_at)}
                      </div>
                    </div>
                    <Link href={`/admin/links/${encodeURIComponent(share.token)}`} className="btn-base btn-secondary rounded-sm px-3 py-2 text-sm">
                      Manage
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="surface-panel-soft mt-4 rounded-sm p-4 text-sm text-[var(--text-secondary)]">
              No protected links yet. Upload a document, then create its first protected link from Documents.
            </div>
          )}
        </div>

        <div className="surface-panel-strong p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Recent views</div>
              <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">Where people are engaging</h2>
            </div>
            <Link href="/admin/activity" className="btn-base btn-secondary rounded-sm px-3 py-2 text-sm">
              Open activity
            </Link>
          </div>

          {activityData.viewsRows.slice(0, 3).length > 0 ? (
            <div className="mt-4 space-y-3">
              {activityData.viewsRows.slice(0, 3).map((row) => (
                <div key={row.doc_id} className="selection-tile p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-[var(--text-primary)]">{row.doc_title || "Untitled document"}</div>
                      <div className="mt-1 text-sm text-[var(--text-secondary)]">
                        {fmtInt(row.views)} views · {fmtInt(row.unique_ips)} unique visitors · Last opened {fmtDateTime(row.last_view)}
                      </div>
                    </div>
                    <Link href={`/admin/activity?viewQ=${encodeURIComponent(row.doc_title || row.doc_id)}`} className="btn-base btn-secondary rounded-sm px-3 py-2 text-sm">
                      View details
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="surface-panel-soft mt-4 rounded-sm p-4 text-sm text-[var(--text-secondary)]">
              No one has opened a shared document yet. Once someone views a link, you will see it here.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
