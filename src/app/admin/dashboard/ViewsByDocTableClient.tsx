"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getShareEligibility, normalizeScanState } from "@/lib/documentStatus";
import {
  bulkDisableAliasesForDocsAction,
  bulkRevokeAllSharesForDocsAction,
  disableAliasForDocAction,
  extendAliasExpirationAction,
  revokeAllSharesForDocAction,
} from "../actions";

export type ViewsByDocRow = {
  doc_id: string;
  doc_title: string | null;
  alias: string | null;
  scan_status: string | null;
  views: number;
  unique_ips: number;
  last_view: string | null;
};

type ViewsRowUpdater = (rows: ViewsByDocRow[]) => ViewsByDocRow[];

type FilterKey = "all" | "engaged" | "recent" | "quiet" | "blocked";

function formatNumber(value: number) {
  try {
    return new Intl.NumberFormat().format(value);
  } catch {
    return String(value);
  }
}

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

function formatRelativeTime(value: string | null) {
  if (!value) return "No views yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDateTime(value);
  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const hour = 60 * 60 * 1000;
  const day = hour * 24;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (absMs < hour) return rtf.format(Math.round(diffMs / (60 * 1000)), "minute");
  if (absMs < day) return rtf.format(Math.round(diffMs / hour), "hour");
  return rtf.format(Math.round(diffMs / day), "day");
}

function getExtension(title: string | null) {
  const clean = String(title || "").trim();
  const idx = clean.lastIndexOf(".");
  if (idx < 0 || idx === clean.length - 1) return "FILE";
  return clean.slice(idx + 1, idx + 5).toUpperCase();
}

function getRowFilter(row: ViewsByDocRow): FilterKey {
  const scanState = normalizeScanState(row.scan_status);
  if (scanState === "MALICIOUS" || scanState === "NEEDS_REVIEW") return "blocked";
  if ((row.views || 0) === 0) return "quiet";
  if (row.last_view) {
    const lastViewTs = new Date(row.last_view).getTime();
    if (Number.isFinite(lastViewTs) && Date.now() - lastViewTs <= 7 * 24 * 60 * 60 * 1000) return "recent";
  }
  return "engaged";
}

function filterLabel(filter: FilterKey, count: number) {
  if (filter === "engaged") return `Most viewed (${count})`;
  if (filter === "recent") return `Recent views (${count})`;
  if (filter === "quiet") return `No views yet (${count})`;
  if (filter === "blocked") return `Blocked (${count})`;
  return `All files (${count})`;
}

function getShareHref(alias: string | null) {
  if (!alias) return null;
  return `/d/${encodeURIComponent(alias)}`;
}

export default function ViewsByDocTableClient(props: {
  rows: ViewsByDocRow[];
  canManageShares?: boolean;
  basePath?: string;
}) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const canManageShares = Boolean(props.canManageShares);
  const basePath = props.basePath ?? "/admin";
  const documentsPath = `${basePath}/documents`;
  const linksPath = `${basePath}/links`;
  const overviewUploadPath = `${basePath}?openPicker=1`;
  const [isPending, startTransition] = useTransition();

  const qFromUrl = (sp.get("viewQ") || "").trim();
  const filterFromUrl = (sp.get("viewFilter") || "all").trim().toLowerCase();
  const limitRaw = Number(sp.get("viewLimit") || "12");
  const initialLimit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 12;

  const [q, setQ] = useState(qFromUrl);
  const [limit, setLimit] = useState(initialLimit);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [rows, setRows] = useState(props.rows);

  const filter: FilterKey =
    filterFromUrl === "engaged" || filterFromUrl === "recent" || filterFromUrl === "quiet" || filterFromUrl === "blocked"
      ? filterFromUrl
      : "all";

  useEffect(() => {
    if (!copiedId) return;
    const id = window.setTimeout(() => setCopiedId(null), 1800);
    return () => window.clearTimeout(id);
  }, [copiedId]);

  useEffect(() => {
    setRows(props.rows);
  }, [props.rows]);

  function syncUrl(next: { viewQ?: string; viewFilter?: FilterKey; viewLimit?: number }) {
    const params = new URLSearchParams(sp.toString());
    if (next.viewQ !== undefined) {
      const value = next.viewQ.trim();
      if (value) params.set("viewQ", value);
      else params.delete("viewQ");
    }
    if (next.viewFilter !== undefined) {
      if (next.viewFilter === "all") params.delete("viewFilter");
      else params.set("viewFilter", next.viewFilter);
    }
    if (next.viewLimit !== undefined) {
      params.set("viewLimit", String(next.viewLimit));
    }
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}${hash}`, { scroll: false });
  }

  const counts = useMemo(() => {
    const next: Record<FilterKey, number> = {
      all: rows.length,
      engaged: 0,
      recent: 0,
      quiet: 0,
      blocked: 0,
    };
    for (const row of rows) next[getRowFilter(row)] += 1;
    return next;
  }, [rows]);

  const filtered = useMemo(() => {
    const normalizedQ = q.trim().toLowerCase();
    const next = rows.filter((row) => {
      const matchesFilter = filter === "all" ? true : getRowFilter(row) === filter;
      if (!matchesFilter) return false;
      if (!normalizedQ) return true;
      return [row.doc_title ?? "", row.alias ?? "", row.doc_id].join(" ").toLowerCase().includes(normalizedQ);
    });
    return next
      .slice()
      .sort((left, right) => {
        const viewDelta = (right.views || 0) - (left.views || 0);
        if (viewDelta !== 0) return viewDelta;
        const rightTs = right.last_view ? new Date(right.last_view).getTime() : 0;
        const leftTs = left.last_view ? new Date(left.last_view).getTime() : 0;
        return rightTs - leftTs;
      })
      .slice(0, limit);
  }, [filter, limit, q, rows]);

  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected]);
  const visibleIds = useMemo(() => filtered.map((row) => row.doc_id), [filtered]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected[id]);
  const anySelected = selectedIds.length > 0;

  const topViewed = rows[0] ?? null;
  const recentlyViewed = useMemo(() => rows.filter((row) => !!row.last_view).length, [rows]);
  const quietCount = counts.quiet;

  async function copyLink(row: ViewsByDocRow) {
    const href = row.alias
      ? `${window.location.origin}/d/${encodeURIComponent(row.alias)}`
      : `${window.location.origin}${documentsPath}/${encodeURIComponent(row.doc_id)}`;
    await navigator.clipboard.writeText(href);
    setCopiedId(row.doc_id);
  }

  function toggleAllVisible(checked: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      for (const id of visibleIds) next[id] = checked;
      return next;
    });
  }

  function downloadCsvForSelected() {
    const selectedRows = rows.filter((row) => selected[row.doc_id]);
    const header = ["file_id", "file_name", "alias", "views", "unique_visits", "last_view"].join(",");
    const lines = selectedRows.map((row) =>
      [
        row.doc_id,
        JSON.stringify(row.doc_title || ""),
        JSON.stringify(row.alias || ""),
        String(row.views),
        String(row.unique_ips),
        JSON.stringify(row.last_view || ""),
      ].join(",")
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `doclinks_insights_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function runAction(action: (fd: FormData) => Promise<void>, fd: FormData, updater?: ViewsRowUpdater) {
    startTransition(async () => {
      await action(fd);
      if (updater) setRows((current) => updater(current));
    });
  }

  return (
    <section className="glass-card-strong rounded-[30px] border border-white/10 bg-white/[0.03]">
      <div className="border-b border-white/10 px-5 py-5">
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-white/45">Most opened</div>
            <div className="mt-2 text-base font-semibold text-white">{topViewed?.doc_title || "No file views yet"}</div>
            <div className="mt-1 text-sm text-white/60">
              {topViewed ? `${formatNumber(topViewed.views)} total view${topViewed.views === 1 ? "" : "s"}` : "Share a protected link to start seeing engagement."}
            </div>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-white/45">Recently viewed</div>
            <div className="mt-2 text-2xl font-semibold text-white">{formatNumber(recentlyViewed)}</div>
            <div className="mt-1 text-sm text-white/60">Files with a recorded last view.</div>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-white/45">Needs a follow-up</div>
            <div className="mt-2 text-2xl font-semibold text-white">{formatNumber(quietCount)}</div>
            <div className="mt-1 text-sm text-white/60">Files that have not been opened yet.</div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="view-doc-search" className="text-xs uppercase tracking-[0.14em] text-white/45">
                Search files
              </label>
              <input
                id="view-doc-search"
                aria-label="Search files in insights"
                value={q}
                onChange={(event) => {
                  const value = event.target.value;
                  setQ(value);
                  syncUrl({ viewQ: value });
                }}
                placeholder="Search by file name or alias"
                className="mt-2 w-full rounded-2xl border border-white/14 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-cyan-300/45 focus:outline-none"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-white/55">
              <span>Show</span>
              <select
                aria-label="Insights page size"
                value={limit}
                onChange={(event) => {
                  const nextLimit = Number(event.target.value);
                  setLimit(nextLimit);
                  syncUrl({ viewLimit: nextLimit });
                }}
                className="rounded-2xl border border-white/14 bg-black/20 px-3 py-3 text-sm text-white"
              >
                {[6, 12, 24, 48].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {(["all", "engaged", "recent", "quiet", "blocked"] as FilterKey[]).map((item) => {
              const active = item === filter;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => syncUrl({ viewFilter: item })}
                  className={[
                    "rounded-full border px-3 py-2 text-xs transition",
                    active
                      ? "border-cyan-300/35 bg-cyan-400/12 text-cyan-100"
                      : "border-white/12 bg-white/[0.03] text-white/65 hover:border-white/18 hover:bg-white/[0.06] hover:text-white",
                  ].join(" ")}
                >
                  {filterLabel(item, counts[item])}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-8">
          <div className="rounded-[28px] border border-dashed border-white/16 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-400/10 text-xs font-semibold tracking-[0.2em] text-cyan-100">
              VIEWS
            </div>
            <h2 className="mt-5 text-2xl font-semibold text-white">No file activity yet</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-white/65">
              Once you share a protected link, this page will show which files people opened and when they came back.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={overviewUploadPath}
                className="btn-base rounded-2xl border border-cyan-300/45 bg-cyan-300 px-5 py-3 text-sm font-semibold text-[#07131f] shadow-[0_14px_32px_rgba(34,211,238,0.18)] hover:bg-cyan-200"
              >
                Upload file
              </Link>
              <Link href={linksPath} className="btn-base btn-secondary rounded-2xl px-4 py-3 text-sm">
                Open shared links
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-5">
          {canManageShares ? (
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/65">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  aria-label="Select all visible files"
                  checked={allVisibleSelected}
                  onChange={(event) => toggleAllVisible(event.target.checked)}
                />
                <span>Select visible files</span>
              </label>
              <span>{selectedIds.length} selected</span>
            </div>
          ) : null}

          {filtered.map((row) => {
            const scanState = normalizeScanState(row.scan_status);
            const shareEligibility = getShareEligibility({ docStateRaw: "ready", scanStateRaw: row.scan_status });
            const shareHref = getShareHref(row.alias);
            const statusLabel =
              scanState === "CLEAN"
                ? "Ready to share"
                : scanState === "PENDING" || scanState === "RUNNING" || scanState === "NOT_SCHEDULED" || scanState === "SKIPPED"
                  ? "Waiting for scan"
                  : "Blocked for safety";
            const statusToneClass =
              scanState === "CLEAN"
                ? "border-emerald-400/30 bg-emerald-400/12 text-emerald-100"
                : scanState === "MALICIOUS" || scanState === "NEEDS_REVIEW"
                  ? "border-rose-400/30 bg-rose-400/12 text-rose-100"
                  : "border-amber-400/30 bg-amber-400/12 text-amber-100";
            const engagementMessage =
              row.views > 0
                ? `${formatNumber(row.views)} total view${row.views === 1 ? "" : "s"} and ${formatNumber(row.unique_ips)} unique visit${row.unique_ips === 1 ? "" : "s"}.`
                : "No views yet. Once you share, activity will show up here.";
            const securityMessage =
              scanState === "CLEAN"
                ? row.alias
                  ? "Protected link is available for sharing."
                  : "This file is safe to share. Create its protected link when you are ready."
                : shareEligibility.blockedReason || "Sharing stays unavailable until the safety check finishes.";

            return (
              <article
                key={row.doc_id}
                className="rounded-[28px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
              >
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start gap-4">
                      {canManageShares ? (
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.doc_title || row.doc_id}`}
                          checked={!!selected[row.doc_id]}
                          onChange={(event) => setSelected((prev) => ({ ...prev, [row.doc_id]: event.target.checked }))}
                          className="mt-3"
                        />
                      ) : null}

                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.06] text-xs font-semibold tracking-[0.16em] text-white/75">
                        {getExtension(row.doc_title)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`${documentsPath}/${row.doc_id}`} className="truncate text-lg font-semibold text-white hover:text-cyan-100">
                            {row.doc_title || "Untitled file"}
                          </Link>
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] ${statusToneClass}`}>{statusLabel}</span>
                          {row.alias ? (
                            <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2.5 py-1 text-[11px] text-cyan-100">
                              Protected link active
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-3 max-w-3xl text-sm text-white/68">{engagementMessage}</p>

                        <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/55">
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                            Last viewed {formatRelativeTime(row.last_view)}
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                            {formatNumber(row.views)} total views
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                            {formatNumber(row.unique_ips)} unique visits
                          </span>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <div className="text-xs uppercase tracking-[0.16em] text-white/45">Engagement</div>
                            <div className="mt-2 text-sm font-medium text-white">{row.views > 0 ? "People are opening this file" : "Waiting for the first view"}</div>
                            <div className="mt-1 text-xs text-white/55">Latest activity {formatDateTime(row.last_view)}</div>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <div className="text-xs uppercase tracking-[0.16em] text-white/45">Security</div>
                            <div className="mt-2 text-sm font-medium text-white">{statusLabel}</div>
                            <div className="mt-1 text-xs text-white/55">{securityMessage}</div>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <div className="text-xs uppercase tracking-[0.16em] text-white/45">Next step</div>
                            <div className="mt-2 text-sm font-medium text-white">
                              {row.alias ? "Share or manage the link" : scanState === "CLEAN" ? "Create a protected link" : "Wait for the scan"}
                            </div>
                            <div className="mt-1 text-xs text-white/55">
                              {row.alias ? "Copy the live link or open it to review the recipient view." : securityMessage}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex w-full flex-col gap-2 xl:w-[280px]">
                    {shareHref ? (
                      <>
                        <button
                          type="button"
                          onClick={() => copyLink(row)}
                          className="btn-base rounded-2xl border border-cyan-300/35 bg-cyan-400/14 px-4 py-3 text-sm font-medium text-cyan-100 hover:bg-cyan-400/22"
                        >
                          {copiedId === row.doc_id ? "Link copied" : "Copy protected link"}
                        </button>
                        <Link
                          href={shareHref}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-base btn-secondary rounded-2xl px-4 py-3 text-center text-sm"
                        >
                          Open shared link
                        </Link>
                      </>
                    ) : scanState === "CLEAN" ? (
                      <Link
                        href={`${documentsPath}?createLink=1&docId=${encodeURIComponent(row.doc_id)}`}
                        className="btn-base rounded-2xl border border-cyan-300/40 bg-cyan-300 px-4 py-3 text-center text-sm font-semibold text-[#07131f] shadow-[0_14px_36px_rgba(34,211,238,0.18)] hover:bg-cyan-200"
                      >
                        Create protected link
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="cursor-not-allowed rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/45"
                      >
                        Sharing unavailable
                      </button>
                    )}

                    <Link
                      href={`${documentsPath}?docQ=${encodeURIComponent(row.doc_title || row.doc_id)}`}
                      className="btn-base btn-secondary rounded-2xl px-4 py-3 text-center text-sm"
                    >
                      Open file
                    </Link>
                    <Link
                      href={`${linksPath}?shareQ=${encodeURIComponent(row.alias || row.doc_title || row.doc_id)}`}
                      className="btn-base btn-secondary rounded-2xl px-4 py-3 text-center text-sm"
                    >
                      Manage links
                    </Link>

                    {canManageShares && row.alias ? (
                      <details className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                        <summary className="cursor-pointer text-sm font-medium text-white">Advanced controls</summary>
                        <div className="mt-3 space-y-2">
                          <button
                            type="button"
                            onClick={() => {
                              const fd = new FormData();
                              fd.set("docId", row.doc_id);
                              runAction(revokeAllSharesForDocAction, fd);
                            }}
                            disabled={isPending}
                            className="btn-base btn-secondary w-full rounded-xl px-3 py-2 text-sm disabled:opacity-40"
                          >
                            Revoke all links
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const fd = new FormData();
                              fd.set("docId", row.doc_id);
                              fd.set("days", "7");
                              runAction(extendAliasExpirationAction, fd);
                            }}
                            disabled={isPending}
                            className="btn-base btn-secondary w-full rounded-xl px-3 py-2 text-sm disabled:opacity-40"
                          >
                            Extend alias 7 days
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const fd = new FormData();
                              fd.set("docId", row.doc_id);
                              runAction(disableAliasForDocAction, fd, (current) =>
                                current.map((item) => (item.doc_id === row.doc_id ? { ...item, alias: null } : item))
                              );
                            }}
                            disabled={isPending}
                            className="btn-base w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-sm text-white/75 hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
                          >
                            Disable alias
                          </button>
                        </div>
                      </details>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="border-t border-white/10 px-5 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-white/60">
            Showing <span className="text-white">{filtered.length}</span> of <span className="text-white">{rows.length}</span> files
          </div>
          <div className="flex flex-wrap gap-2">
            {canManageShares ? (
              <>
                <button
                  type="button"
                  disabled={!anySelected || isPending}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("docIds", JSON.stringify(selectedIds));
                    runAction(bulkRevokeAllSharesForDocsAction, fd);
                  }}
                  className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm disabled:opacity-40"
                >
                  Revoke selected links
                </button>
                <button
                  type="button"
                  disabled={!anySelected || isPending}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("docIds", JSON.stringify(selectedIds));
                    runAction(bulkDisableAliasesForDocsAction, fd, (current) =>
                      current.map((item) =>
                        selectedIds.includes(item.doc_id) ? { ...item, alias: null } : item
                      )
                    );
                  }}
                  className="btn-base rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-sm text-white/75 hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
                >
                  Disable selected aliases
                </button>
              </>
            ) : null}
            <button
              type="button"
              disabled={!anySelected}
              onClick={() => {
                if (anySelected) downloadCsvForSelected();
              }}
              className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm disabled:opacity-40"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => setSelected({})}
              className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm"
            >
              Clear selection
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
