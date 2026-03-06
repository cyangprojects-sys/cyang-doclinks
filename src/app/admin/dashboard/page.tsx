// src/app/admin/dashboard/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { getDocumentUiStatus, getShareEligibility } from "@/lib/documentStatus";

import AnalyticsWidgets from "./AnalyticsWidgets";
import ViewerHelpfulTiles from "./ViewerHelpfulTiles";
import DashboardHeaderActions from "./DashboardHeaderActions";
import { getDashboardHomeData } from "./data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function toneClass(tone: "positive" | "warning" | "danger" | "neutral") {
  if (tone === "danger") return "border-rose-500/35 bg-rose-500/15 text-rose-100";
  if (tone === "warning") return "border-amber-500/35 bg-amber-500/15 text-amber-100";
  if (tone === "positive") return "border-emerald-500/35 bg-emerald-500/15 text-emerald-100";
  return "border-white/20 bg-white/10 text-white/85";
}

function fmtDate(s: string | null): string {
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

export default async function AdminDashboardPage() {
  let u;
  try {
    u = await requireUser();
  } catch {
    redirect("/api/auth/signin");
  }

  const data = await getDashboardHomeData(u);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Overview</h1>
          <div className="mt-1 text-sm text-white/65">Your protected documents and links</div>
        </div>
        <DashboardHeaderActions docs={data.headerDocs} planId={data.planId} />
      </div>

      <AnalyticsWidgets ownerId={data.canSeeAll ? undefined : u.id} userId={u.id} showHealth={u.role === "owner"} />

      {data.missingCoreTables ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-300">
          <div className="font-medium text-neutral-100">Setup incomplete</div>
          <div className="mt-1 text-neutral-400">
            Your database is missing one or more tables required for dashboard analytics.
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-neutral-400">
            <li>public.docs: {data.hasDocs ? "ok" : "missing"}</li>
            <li>public.doc_views: {data.hasDocViews ? "ok" : "missing"}</li>
            <li>public.share_tokens: {data.hasShareTokens ? "ok" : "missing"}</li>
            <li>public.doc_aliases: {data.hasDocAliases ? "ok" : "missing"}</li>
          </ul>
        </div>
      ) : null}

      <section id="activity" className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Shortcuts</h2>
          <Link className="text-xs text-neutral-500 hover:underline" href="/admin/activity">
            View activity →
          </Link>
        </div>
        <ViewerHelpfulTiles userId={u.id} orgId={u.orgId} hasOrgId={data.hasOrgId} />
      </section>

      <section id="recent-docs" className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Recent documents</h2>
          <Link className="text-xs text-neutral-500 hover:underline" href="/admin/documents">
            View all documents →
          </Link>
        </div>

        <div className="glass-card-strong overflow-hidden rounded-2xl">
          {data.recentDocs.length ? (
            <ul className="divide-y divide-white/10">
              {data.recentDocs.map((doc) => {
                const ui = getDocumentUiStatus({
                  docStateRaw: doc.doc_state,
                  scanStateRaw: doc.scan_status,
                  moderationStatusRaw: doc.moderation_status,
                });
                const share = getShareEligibility({
                  docStateRaw: doc.doc_state,
                  scanStateRaw: doc.scan_status,
                  moderationStatusRaw: doc.moderation_status,
                });
                const shareHref = `/admin/dashboard?createLink=1&docId=${encodeURIComponent(doc.doc_id)}`;
                return (
                  <li key={doc.doc_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-white">{doc.doc_title || "Untitled document"}</div>
                      <div className="mt-1 text-xs text-white/60">Added {fmtDate(doc.created_at)}</div>
                    </div>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${toneClass(ui.tone)}`}>
                      {ui.label}
                    </span>
                    <div className="flex items-center gap-2">
                      {share.canCreateLink ? (
                        <Link href={shareHref} className="rounded-lg border border-cyan-400/35 bg-cyan-400/20 px-3 py-1.5 text-xs text-cyan-50 hover:bg-cyan-400/30">
                          Share
                        </Link>
                      ) : (
                        <button
                          type="button"
                          disabled
                          title={share.blockedReason || "Sharing unavailable"}
                          className="cursor-not-allowed rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/45"
                        >
                          Share
                        </button>
                      )}
                      <Link href={`/admin/docs/${encodeURIComponent(doc.doc_id)}`} className="rounded-md border border-white/15 bg-transparent px-2 py-1 text-[11px] text-white/65 hover:bg-white/10 hover:text-white">
                        Details
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="p-4 text-sm text-white/70">
              No documents yet.
              <div className="mt-2 flex flex-wrap gap-2">
                <Link href="/admin/uploads?openPicker=1" className="btn-base btn-secondary rounded-lg px-2.5 py-1.5 text-xs">
                  Upload document
                </Link>
                <Link href="/admin/uploads?openPicker=1&fromCreateLink=1" className="btn-base btn-secondary rounded-lg px-2.5 py-1.5 text-xs">
                  Create protected link
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      <section id="settings" className="space-y-2">
        <h2 className="text-lg font-semibold">Pro</h2>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/75">
          <div className="font-medium text-white">Upgrade to unlock stricter controls</div>
          <div className="mt-1">Get one-time access, legal/confidential presets, and ID verification mode.</div>
          <Link href="/admin/upgrade" className="mt-3 inline-flex rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15">
            See Pro features
          </Link>
        </div>
      </section>
    </div>
  );
}
