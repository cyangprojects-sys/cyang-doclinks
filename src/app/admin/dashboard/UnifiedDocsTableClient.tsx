"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import DeleteDocForm from "../DeleteDocForm";
import { bulkDeleteDocsAction, deleteDocAction } from "../actions";
import {
  getDocumentUiStatus,
  getShareEligibility,
  normalizeDocState,
  normalizeScanState,
  type StatusTone,
} from "@/lib/documentStatus";

export type UnifiedDocRow = {
  doc_id: string;
  doc_title: string | null;
  doc_state: string | null;
  created_at: string | null;
  alias: string | null;
  scan_status: string | null;
  moderation_status: string | null;
  total_views: number;
  last_view: string | null;
  active_shares: number;
  latest_share_token?: string | null;
  latest_share_created_at?: string | null;
  alias_expires_at: string | null;
  alias_is_active: boolean | null;
  alias_revoked_at: string | null;
};

type SortKey = "created_at" | "doc_title" | "total_views" | "last_view" | "active_shares" | "status";
type SortDir = "asc" | "desc";
type FilterKey = "all" | "ready" | "shared" | "awaiting_scan" | "attention" | "not_shared";
// Pending scans still refresh automatically, but on a slower cadence so idle tabs do less work.
const PENDING_SCAN_REFRESH_MS = 180_000;

function formatDateTime(value: string | null) {
  if (!value) return "No activity yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function formatShortDate(value: string | null) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

function formatRelativeTime(value: string | null) {
  if (!value) return "No views yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDateTime(value);
  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (absMs < hour) return rtf.format(Math.round(diffMs / (60 * 1000)), "minute");
  if (absMs < day) return rtf.format(Math.round(diffMs / hour), "hour");
  return rtf.format(Math.round(diffMs / day), "day");
}

function formatNumber(value: number) {
  try {
    return new Intl.NumberFormat().format(value);
  } catch {
    return String(value);
  }
}

function toneClass(tone: StatusTone) {
  if (tone === "positive") return "border-emerald-400/30 bg-emerald-400/12 text-emerald-100";
  if (tone === "warning") return "border-amber-400/30 bg-amber-400/12 text-amber-100";
  if (tone === "danger") return "border-rose-400/30 bg-rose-400/12 text-rose-100";
  return "border-white/12 bg-white/6 text-white/80";
}

function getExtension(title: string | null) {
  const clean = String(title || "").trim();
  const idx = clean.lastIndexOf(".");
  if (idx < 0 || idx === clean.length - 1) return "DOC";
  return clean.slice(idx + 1, idx + 5).toUpperCase();
}

function getShareUrl(base: string | undefined, token: string | null | undefined) {
  if (!token) return null;
  const baseUrl = String(base || "").trim().replace(/\/+$/, "");
  if (baseUrl) return `${baseUrl}/s/${encodeURIComponent(token)}`;
  if (typeof window !== "undefined") return `${window.location.origin}/s/${encodeURIComponent(token)}`;
  return `/s/${encodeURIComponent(token)}`;
}

function getStatusBucket(row: UnifiedDocRow): FilterKey {
  const docState = normalizeDocState(row.doc_state);
  const scanState = normalizeScanState(row.scan_status, row.moderation_status);
  const share = getShareEligibility({
    docStateRaw: row.doc_state,
    scanStateRaw: row.scan_status,
    moderationStatusRaw: row.moderation_status,
  });
  const canCreateLinkNow = share.canCreateLink && scanState === "CLEAN" && docState === "READY";

  if (canCreateLinkNow && row.active_shares > 0) return "shared";
  if (canCreateLinkNow && row.active_shares === 0) return "ready";
  if (scanState === "PENDING" || scanState === "RUNNING" || scanState === "NOT_SCHEDULED" || scanState === "SKIPPED") {
    return "awaiting_scan";
  }
  if (scanState === "MALICIOUS" || scanState === "NEEDS_REVIEW" || docState === "ERROR") return "attention";
  return "not_shared";
}

function getStatusRank(row: UnifiedDocRow) {
  const bucket = getStatusBucket(row);
  if (bucket === "ready") return 0;
  if (bucket === "shared") return 1;
  if (bucket === "awaiting_scan") return 2;
  if (bucket === "not_shared") return 3;
  return 4;
}

function buildFilterLabel(filter: FilterKey, count: number) {
  if (filter === "ready") return `Ready (${count})`;
  if (filter === "shared") return `Shared (${count})`;
  if (filter === "awaiting_scan") return `Waiting for scan (${count})`;
  if (filter === "attention") return `Needs attention (${count})`;
  if (filter === "not_shared") return `No link yet (${count})`;
  return `All (${count})`;
}

export default function UnifiedDocsTableClient(props: {
  rows: UnifiedDocRow[];
  defaultPageSize?: number;
  showDelete?: boolean;
  layout?: "embedded" | "full";
  shareBaseUrl?: string;
  basePath?: string;
}) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const showDelete = Boolean(props.showDelete);
  const layout = props.layout ?? "embedded";
  const basePath = props.basePath ?? "/admin";
  const documentsPath = `${basePath}/documents`;
  const linksPath = `${basePath}/links`;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const q = (sp.get("docQ") || "").trim();
  const filter = ((sp.get("docStatus") || "all") as FilterKey);
  const pageRaw = Number(sp.get("docPage") || "1");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const pageSizeRaw = Number(sp.get("docPageSize") || String(props.defaultPageSize ?? 12));
  const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? pageSizeRaw : props.defaultPageSize ?? 12;
  const sortKeyRaw = String(sp.get("docSort") || "created_at");
  const sortKey: SortKey =
    sortKeyRaw === "doc_title" ||
    sortKeyRaw === "total_views" ||
    sortKeyRaw === "last_view" ||
    sortKeyRaw === "active_shares" ||
    sortKeyRaw === "status"
      ? sortKeyRaw
      : "created_at";
  const sortDir: SortDir = (sp.get("docDir") || (sortKey === "doc_title" ? "asc" : "desc")) === "asc" ? "asc" : "desc";

  function syncUrl(
    next: Partial<{
      docQ: string;
      docStatus: FilterKey;
      docPage: number;
      docPageSize: number;
      docSort: SortKey;
      docDir: SortDir;
    }>
  ) {
    const params = new URLSearchParams(sp.toString());
    if (next.docQ !== undefined) {
      const value = next.docQ.trim();
      if (value) params.set("docQ", value);
      else params.delete("docQ");
    }
    if (next.docStatus !== undefined) {
      if (next.docStatus === "all") params.delete("docStatus");
      else params.set("docStatus", next.docStatus);
    }
    if (next.docPage !== undefined) params.set("docPage", String(next.docPage));
    if (next.docPageSize !== undefined) params.set("docPageSize", String(next.docPageSize));
    if (next.docSort !== undefined) params.set("docSort", next.docSort);
    if (next.docDir !== undefined) params.set("docDir", next.docDir);
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  const hasPendingScans = useMemo(() => {
    return props.rows.some((row) => {
      const scanState = normalizeScanState(row.scan_status, row.moderation_status);
      return scanState === "PENDING" || scanState === "RUNNING" || scanState === "NOT_SCHEDULED";
    });
  }, [props.rows]);

  useEffect(() => {
    if (!hasPendingScans) return;
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
    };
    const id = window.setInterval(refreshIfVisible, PENDING_SCAN_REFRESH_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshIfVisible();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [hasPendingScans, router]);

  useEffect(() => {
    if (!copiedId) return;
    const id = window.setTimeout(() => setCopiedId(null), 1800);
    return () => window.clearTimeout(id);
  }, [copiedId]);

  const normalizedQ = q.toLowerCase();

  const counts = useMemo(() => {
    const next: Record<FilterKey, number> = {
      all: props.rows.length,
      ready: 0,
      shared: 0,
      awaiting_scan: 0,
      attention: 0,
      not_shared: 0,
    };
    for (const row of props.rows) next[getStatusBucket(row)] += 1;
    return next;
  }, [props.rows]);

  const readyWithoutLinks = useMemo(() => props.rows.filter((row) => getStatusBucket(row) === "ready").slice(0, 3), [props.rows]);
  const sharedRows = useMemo(() => props.rows.filter((row) => getStatusBucket(row) === "shared").slice(0, 2), [props.rows]);
  const awaitingScanRows = useMemo(
    () => props.rows.filter((row) => getStatusBucket(row) === "awaiting_scan").slice(0, 3),
    [props.rows]
  );

  const totals = useMemo(() => {
    const activeLinks = props.rows.reduce((sum, row) => sum + Math.max(0, row.active_shares || 0), 0);
    return {
      documents: props.rows.length,
      ready: counts.ready + counts.shared,
      activeLinks,
      awaitingScan: counts.awaiting_scan,
    };
  }, [counts.awaiting_scan, counts.ready, counts.shared, props.rows]);

  const filtered = useMemo(() => {
    return props.rows.filter((row) => {
      const matchesFilter = filter === "all" ? true : getStatusBucket(row) === filter;
      if (!matchesFilter) return false;
      if (!normalizedQ) return true;
      const haystack = [
        row.doc_title ?? "",
        row.alias ?? "",
        row.doc_id,
        row.latest_share_token ?? "",
        getDocumentUiStatus({
          docStateRaw: row.doc_state,
          scanStateRaw: row.scan_status,
          moderationStatusRaw: row.moderation_status,
        }).label,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQ);
    });
  }, [filter, normalizedQ, props.rows]);

  const sorted = useMemo(() => {
    const direction = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((left, right) => {
      const leftStatus = getDocumentUiStatus({
        docStateRaw: left.doc_state,
        scanStateRaw: left.scan_status,
        moderationStatusRaw: left.moderation_status,
      });
      const rightStatus = getDocumentUiStatus({
        docStateRaw: right.doc_state,
        scanStateRaw: right.scan_status,
        moderationStatusRaw: right.moderation_status,
      });

      let a: number | string = "";
      let b: number | string = "";

      if (sortKey === "created_at") {
        a = left.created_at ? new Date(left.created_at).getTime() : 0;
        b = right.created_at ? new Date(right.created_at).getTime() : 0;
      } else if (sortKey === "doc_title") {
        a = String(left.doc_title || "Untitled").toLowerCase();
        b = String(right.doc_title || "Untitled").toLowerCase();
      } else if (sortKey === "total_views") {
        a = left.total_views || 0;
        b = right.total_views || 0;
      } else if (sortKey === "last_view") {
        a = left.last_view ? new Date(left.last_view).getTime() : 0;
        b = right.last_view ? new Date(right.last_view).getTime() : 0;
      } else if (sortKey === "active_shares") {
        a = left.active_shares || 0;
        b = right.active_shares || 0;
      } else {
        a = getStatusRank(left) * 10 + leftStatus.label.length;
        b = getStatusRank(right) * 10 + rightStatus.label.length;
      }

      if (typeof a === "number" && typeof b === "number") {
        if (a === b) return 0;
        return a > b ? direction : -direction;
      }
      const leftValue = String(a);
      const rightValue = String(b);
      if (leftValue === rightValue) return 0;
      return leftValue > rightValue ? direction : -direction;
    });
  }, [filtered, sortDir, sortKey]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [pageSize, safePage, sorted]);

  const pageDocIds = pageRows.map((row) => row.doc_id);
  const allPageSelected = pageDocIds.length > 0 && pageDocIds.every((id) => selectedIds.includes(id));
  const anySelected = selectedIds.length > 0;

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((prev) => (checked ? Array.from(new Set([...prev, id])) : prev.filter((item) => item !== id)));
  }

  function toggleAllOnPage(checked: boolean) {
    setSelectedIds((prev) => {
      if (!checked) return prev.filter((id) => !pageDocIds.includes(id));
      return Array.from(new Set([...prev, ...pageDocIds]));
    });
  }

  function buildCreateLinkHref(docId: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("createLink", "1");
    params.set("docId", docId);
    return `${pathname}?${params.toString()}`;
  }

  async function copyLatestLink(docId: string, token: string | null | undefined) {
    const url = getShareUrl(props.shareBaseUrl, token);
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopiedId(docId);
  }

  return (
    <div className="space-y-5">
      {layout === "full" ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="glass-card-strong rounded-[26px] p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-white/45">Documents</div>
              <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(totals.documents)}</div>
              <div className="mt-1 text-sm text-white/60">Everything in your secure library.</div>
            </div>
            <div className="glass-card-strong rounded-[26px] p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-white/45">Ready to share</div>
              <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(totals.ready)}</div>
              <div className="mt-1 text-sm text-white/60">Scanned and available for protected links.</div>
            </div>
            <div className="glass-card-strong rounded-[26px] p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-white/45">Active links</div>
              <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(totals.activeLinks)}</div>
              <div className="mt-1 text-sm text-white/60">Protected links your recipients can use now.</div>
            </div>
            <div className="glass-card-strong rounded-[26px] p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-white/45">Waiting for scan</div>
              <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(totals.awaitingScan)}</div>
              <div className="mt-1 text-sm text-white/60">Sharing unlocks automatically after a clean result.</div>
            </div>
          </section>
          {props.rows.length > 0 ? (
            <section className="grid gap-4 xl:grid-cols-[1.4fr_minmax(0,1fr)]">
              <div className="glass-card-strong rounded-[28px] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-cyan-200/70">Step 2</div>
                    <h2 className="mt-2 text-xl font-semibold text-white">Create protected links from ready files</h2>
                    <p className="mt-2 max-w-2xl text-sm text-white/65">
                      Once a document is clean, create its protected link here. Then copy it or manage it from the links page.
                    </p>
                  </div>
                  <Link href={linksPath} className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
                    Manage all links
                  </Link>
                </div>

                {readyWithoutLinks.length > 0 ? (
                  <div className="mt-5 space-y-3">
                    {readyWithoutLinks.map((row) => (
                      <div
                        key={row.doc_id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.07] p-4"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white">{row.doc_title || "Untitled document"}</div>
                          <div className="mt-1 text-xs text-emerald-100/80">Scan complete. No protected link yet.</div>
                        </div>
                        <Link
                          href={buildCreateLinkHref(row.doc_id)}
                          className="btn-base rounded-xl border border-emerald-300/45 bg-emerald-300 px-4 py-2 text-sm font-semibold text-[#082012] shadow-[0_10px_28px_rgba(74,222,128,0.2)] hover:bg-emerald-200"
                        >
                          Create protected link
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : sharedRows.length > 0 ? (
                  <div className="mt-5 space-y-3">
                    {sharedRows.map((row) => (
                      <div
                        key={row.doc_id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/12 bg-white/[0.04] p-4"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white">{row.doc_title || "Untitled document"}</div>
                          <div className="mt-1 text-xs text-white/65">
                            {row.active_shares} active protected {row.active_shares === 1 ? "link" : "links"}.
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {row.latest_share_token ? (
                            <button
                              type="button"
                              onClick={() => copyLatestLink(row.doc_id, row.latest_share_token)}
                              className="btn-base rounded-xl border border-cyan-300/35 bg-cyan-400/14 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-400/22"
                            >
                              {copiedId === row.doc_id ? "Copied" : "Copy latest link"}
                            </button>
                          ) : null}
                          <Link
                            href={
                              row.latest_share_token
                                ? `${linksPath}/${encodeURIComponent(row.latest_share_token)}`
                                : `${linksPath}?shareQ=${encodeURIComponent(row.doc_title || row.doc_id)}`
                            }
                            className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm"
                          >
                            Manage links
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
                    Upload a file above. As soon as the security scan finishes, you will be able to create its protected link here.
                  </div>
                )}
              </div>

              <div className="glass-card-strong rounded-[28px] p-5">
                <div className="text-xs uppercase tracking-[0.18em] text-amber-200/70">Security status</div>
                <h2 className="mt-2 text-xl font-semibold text-white">Clear, reassuring trust signals</h2>
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.07] p-4">
                    <div className="text-sm font-medium text-white">Scan complete</div>
                    <div className="mt-1 text-sm text-emerald-100/80">Files marked Ready are safe to turn into protected links.</div>
                  </div>
                  <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] p-4">
                    <div className="text-sm font-medium text-white">Waiting for scan</div>
                    <div className="mt-1 text-sm text-amber-100/80">
                      Sharing stays unavailable until the security scan finishes. This happens automatically.
                    </div>
                  </div>
                  <div className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] p-4">
                    <div className="text-sm font-medium text-white">Blocked or needs review</div>
                    <div className="mt-1 text-sm text-rose-100/80">
                      Quarantined or flagged files stay blocked so you never accidentally share them.
                    </div>
                  </div>
                  {awaitingScanRows.length > 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-white/45">In progress</div>
                      <div className="mt-2 space-y-2">
                        {awaitingScanRows.map((row) => (
                          <div key={row.doc_id} className="flex items-center justify-between gap-3 text-sm text-white/75">
                            <span className="truncate">{row.doc_title || "Untitled document"}</span>
                            <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-100">
                              Waiting for scan
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      <section className="glass-card-strong rounded-[30px]">
        <div className="flex flex-col gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-white/45">Your documents</div>
              <h2 className="mt-2 text-xl font-semibold text-white">Upload, create a protected link, then share</h2>
              <p className="mt-2 max-w-2xl text-sm text-white/65">
                Each document stays clearly labeled as Ready, Waiting for scan, or Blocked so you always know when sharing is safe.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["all", "ready", "shared", "awaiting_scan", "attention", "not_shared"] as FilterKey[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => syncUrl({ docStatus: item, docPage: 1 })}
                  className={[
                    "btn-base rounded-full border px-3 py-1.5 text-sm",
                    filter === item
                      ? "border-cyan-300/35 bg-cyan-400/14 text-cyan-50"
                      : "border-white/10 bg-white/[0.04] text-white/70 hover:border-white/20 hover:bg-white/[0.08] hover:text-white",
                  ].join(" ")}
                >
                  {buildFilterLabel(item, counts[item])}
                </button>
              ))}
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[420px]">
            <label className="text-xs text-white/55" htmlFor="documents-search">
              Search
            </label>
            <input
              id="documents-search"
              aria-label="Search documents"
              value={q}
              onChange={(event) => syncUrl({ docQ: event.target.value, docPage: 1 })}
              placeholder="Search by document name, link token, or status"
              className="w-full rounded-2xl border border-white/14 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-cyan-300/45 focus:outline-none"
            />
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/55">
              <span>{formatNumber(total)} shown</span>
              <span aria-hidden="true">|</span>
              <label className="flex items-center gap-2">
                <span>Sort</span>
                <select
                  aria-label="Sort documents"
                  value={`${sortKey}:${sortDir}`}
                  onChange={(event) => {
                    const [nextSort, nextDir] = event.target.value.split(":") as [SortKey, SortDir];
                    syncUrl({ docSort: nextSort, docDir: nextDir, docPage: 1 });
                  }}
                  className="rounded-xl border border-white/14 bg-black/20 px-3 py-2 text-white"
                >
                  <option value="created_at:desc">Newest first</option>
                  <option value="status:asc">Most actionable first</option>
                  <option value="doc_title:asc">Name A-Z</option>
                  <option value="active_shares:desc">Most shared</option>
                  <option value="total_views:desc">Most viewed</option>
                  <option value="last_view:desc">Recently viewed</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span>Page size</span>
                <select
                  aria-label="Documents page size"
                  value={pageSize}
                  onChange={(event) => syncUrl({ docPageSize: Number(event.target.value), docPage: 1 })}
                  className="rounded-xl border border-white/14 bg-black/20 px-3 py-2 text-white"
                >
                  {[10, 25, 50].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              {showDelete ? (
                <button
                  type="button"
                  disabled={!anySelected || isPending}
                  onClick={() => {
                    if (!anySelected) return;
                    const confirmed = window.prompt(`Type REMOVE ${selectedIds.length} to confirm.`);
                    if (confirmed !== `REMOVE ${selectedIds.length}`) return;
                    const fd = new FormData();
                    fd.set("docIds", JSON.stringify(selectedIds));
                    startTransition(async () => {
                      await bulkDeleteDocsAction(fd);
                      router.refresh();
                    });
                    setSelectedIds([]);
                  }}
                  className="btn-base rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-white/75 hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isPending ? "Removing..." : `Remove selected (${selectedIds.length})`}
                </button>
              ) : null}
            </div>
          </div>
        </div>
        {pageRows.length === 0 ? (
          <div className="p-6">
            <div className="rounded-[28px] border border-dashed border-white/16 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-8 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-400/10 text-sm font-semibold tracking-[0.2em] text-cyan-100">
                DOC
              </div>
              <h3 className="mt-5 text-2xl font-semibold text-white">Upload your first document</h3>
              <p className="mx-auto mt-3 max-w-2xl text-sm text-white/65">
                Add a file, wait for the security scan to finish, then create a protected link to share with confidence.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href={`${pathname}?openPicker=1`}
                  className="btn-base rounded-xl border border-cyan-300/45 bg-cyan-300 px-5 py-3 text-sm font-semibold text-[#07131f] shadow-[0_14px_32px_rgba(34,211,238,0.18)] hover:bg-cyan-200"
                >
                  Upload document
                </Link>
                <Link href={linksPath} className="btn-base btn-secondary rounded-xl px-4 py-3 text-sm">
                  View links
                </Link>
              </div>
              <div className="mt-6 grid gap-3 text-left sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="text-sm font-medium text-white">1. Upload</div>
                  <div className="mt-1 text-sm text-white/60">Choose a document from your device.</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="text-sm font-medium text-white">2. Protect</div>
                  <div className="mt-1 text-sm text-white/60">We scan it before sharing becomes available.</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="text-sm font-medium text-white">3. Share</div>
                  <div className="mt-1 text-sm text-white/60">Create a protected link and copy it when ready.</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3 p-5">
            {showDelete ? (
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/65">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    aria-label="Select all visible documents"
                    checked={allPageSelected}
                    onChange={(event) => toggleAllOnPage(event.target.checked)}
                  />
                  <span>Select visible documents</span>
                </label>
                <span>{selectedIds.length} selected</span>
              </div>
            ) : null}

            {pageRows.map((row) => {
              const docStatus = getDocumentUiStatus({
                docStateRaw: row.doc_state,
                scanStateRaw: row.scan_status,
                moderationStatusRaw: row.moderation_status,
              });
              const shareEligibility = getShareEligibility({
                docStateRaw: row.doc_state,
                scanStateRaw: row.scan_status,
                moderationStatusRaw: row.moderation_status,
              });
              const scanState = normalizeScanState(row.scan_status, row.moderation_status);
              const docState = normalizeDocState(row.doc_state);
              const canCreateLinkNow = shareEligibility.canCreateLink && scanState === "CLEAN" && docState === "READY";
              const latestShareUrl = getShareUrl(props.shareBaseUrl, row.latest_share_token);
              const primaryMessage = canCreateLinkNow
                ? row.active_shares > 0
                  ? "Protected links are already live for this document."
                  : "Ready to share. Create the first protected link now."
                : shareEligibility.blockedReason || "This document is not ready to share yet.";
              const readinessText =
                scanState === "CLEAN"
                  ? "Scan complete"
                  : scanState === "PENDING" || scanState === "RUNNING" || scanState === "NOT_SCHEDULED" || scanState === "SKIPPED"
                    ? "Waiting for scan"
                    : scanState === "MALICIOUS"
                      ? "Blocked"
                      : "Needs review";
              const manageHref = row.latest_share_token
                ? `${linksPath}/${encodeURIComponent(row.latest_share_token)}`
                : `${linksPath}?shareQ=${encodeURIComponent(row.doc_title || row.doc_id)}`;
              const detailsHref = `${documentsPath}/${row.doc_id}`;

              return (
                <article
                  key={row.doc_id}
                  className="rounded-[28px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                >
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start gap-4">
                        {showDelete ? (
                          <input
                            type="checkbox"
                            aria-label={`Select ${row.doc_title || row.doc_id}`}
                            checked={selectedIds.includes(row.doc_id)}
                            onChange={(event) => toggleRow(row.doc_id, event.target.checked)}
                            className="mt-3"
                          />
                        ) : null}

                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.06] text-xs font-semibold tracking-[0.16em] text-white/75">
                          {getExtension(row.doc_title)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={detailsHref} className="truncate text-lg font-semibold text-white hover:text-cyan-100">
                              {row.doc_title || "Untitled document"}
                            </Link>
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] ${toneClass(docStatus.tone)}`}>
                              {docStatus.label}
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/70">
                              {readinessText}
                            </span>
                            {row.active_shares > 0 ? (
                              <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2.5 py-1 text-[11px] text-cyan-100">
                                {row.active_shares} active {row.active_shares === 1 ? "link" : "links"}
                              </span>
                            ) : null}
                          </div>

                          <p className="mt-3 max-w-3xl text-sm text-white/68">{primaryMessage}</p>

                          <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/55">
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                              Added {formatShortDate(row.created_at)}
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                              {formatNumber(row.total_views || 0)} views
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                              Last viewed {formatRelativeTime(row.last_view)}
                            </span>
                            {row.latest_share_created_at ? (
                              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                                Latest link {formatShortDate(row.latest_share_created_at)}
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                              <div className="text-xs uppercase tracking-[0.16em] text-white/45">Security</div>
                              <div className="mt-2 text-sm font-medium text-white">{docStatus.subtext}</div>
                              <div className="mt-1 text-xs text-white/55">
                                {scanState === "CLEAN"
                                  ? "Sharing is available."
                                  : scanState === "MALICIOUS"
                                    ? "Sharing remains disabled."
                                    : "We will unlock sharing after the scan completes."}
                              </div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                              <div className="text-xs uppercase tracking-[0.16em] text-white/45">Sharing</div>
                              <div className="mt-2 text-sm font-medium text-white">
                                {row.active_shares > 0 ? "Protected links live" : "No link yet"}
                              </div>
                              <div className="mt-1 text-xs text-white/55">
                                {canCreateLinkNow
                                  ? row.active_shares > 0
                                    ? "Copy the latest link or create another."
                                    : "Create the first protected link from this document."
                                  : shareEligibility.blockedReason || "Waiting for the next step."}
                              </div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                              <div className="text-xs uppercase tracking-[0.16em] text-white/45">Activity</div>
                              <div className="mt-2 text-sm font-medium text-white">{formatNumber(row.total_views || 0)} views</div>
                              <div className="mt-1 text-xs text-white/55">Last activity {formatDateTime(row.last_view)}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex w-full flex-col gap-2 xl:w-[280px]">
                      {canCreateLinkNow && row.active_shares === 0 ? (
                        <Link
                          href={buildCreateLinkHref(row.doc_id)}
                          className="btn-base rounded-2xl border border-cyan-300/40 bg-cyan-300 px-4 py-3 text-center text-sm font-semibold text-[#07131f] shadow-[0_14px_36px_rgba(34,211,238,0.18)] hover:bg-cyan-200"
                        >
                          Create protected link
                        </Link>
                      ) : canCreateLinkNow && latestShareUrl ? (
                        <>
                          <button
                            type="button"
                            onClick={() => copyLatestLink(row.doc_id, row.latest_share_token)}
                            className="btn-base rounded-2xl border border-cyan-300/35 bg-cyan-400/14 px-4 py-3 text-sm font-medium text-cyan-100 hover:bg-cyan-400/22"
                          >
                            {copiedId === row.doc_id ? "Link copied" : "Copy latest link"}
                          </button>
                          <Link
                            href={latestShareUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-base btn-secondary rounded-2xl px-4 py-3 text-center text-sm"
                          >
                            Open shared link
                          </Link>
                          <Link href={buildCreateLinkHref(row.doc_id)} className="btn-base btn-secondary rounded-2xl px-4 py-3 text-center text-sm">
                            Create another link
                          </Link>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled
                          title={shareEligibility.blockedReason || "Sharing unavailable"}
                          className="cursor-not-allowed rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/45"
                        >
                          {scanState === "MALICIOUS" || docState === "ERROR" ? "Sharing blocked" : "Create link when ready"}
                        </button>
                      )}

                      <Link href={manageHref} className="btn-base btn-secondary rounded-2xl px-4 py-3 text-center text-sm">
                        Manage links
                      </Link>
                      <Link href={detailsHref} className="btn-base btn-secondary rounded-2xl px-4 py-3 text-center text-sm">
                        View details
                      </Link>

                      {showDelete ? (
                        <div className="pt-1 text-right">
                          <DeleteDocForm
                            docId={row.doc_id}
                            title={row.doc_title || row.alias || row.doc_id}
                            action={deleteDocAction}
                            label="Remove"
                            variant="subtle"
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {pageRows.length > 0 ? (
          <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-4 text-sm text-white/60 md:flex-row md:items-center md:justify-between">
            <div>
              Page <span className="text-white">{safePage}</span> of <span className="text-white">{totalPages}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => syncUrl({ docPage: 1 })}
                className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm disabled:opacity-40"
              >
                First
              </button>
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => syncUrl({ docPage: Math.max(1, safePage - 1) })}
                className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => syncUrl({ docPage: Math.min(totalPages, safePage + 1) })}
                className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm disabled:opacity-40"
              >
                Next
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => syncUrl({ docPage: totalPages })}
                className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm disabled:opacity-40"
              >
                Last
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
