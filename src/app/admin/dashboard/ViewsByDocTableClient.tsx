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

type ViewsRowPatch = Partial<ViewsByDocRow>;
type ViewsRowPatchInput = ViewsRowPatch | ((row: ViewsByDocRow) => ViewsRowPatch);

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
  const [rowOverrides, setRowOverrides] = useState<Record<string, ViewsRowPatch>>({});

  const filter: FilterKey =
    filterFromUrl === "engaged" || filterFromUrl === "recent" || filterFromUrl === "quiet" || filterFromUrl === "blocked"
      ? filterFromUrl
      : "all";

  useEffect(() => {
    if (!copiedId) return;
    const id = window.setTimeout(() => setCopiedId(null), 1800);
    return () => window.clearTimeout(id);
  }, [copiedId]);

  const rows = useMemo(
    () =>
      props.rows.map((row) => ({
        ...row,
        ...(rowOverrides[row.doc_id] ?? {}),
      })),
    [props.rows, rowOverrides]
  );

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

  function applyRowPatch(docIds: string[], patchInput: ViewsRowPatchInput) {
    setRowOverrides((current) => {
      const next = { ...current };
      for (const docId of docIds) {
        const source = rows.find((row) => row.doc_id === docId);
        if (!source) continue;
        const patch = typeof patchInput === "function" ? patchInput(source) : patchInput;
        next[docId] = { ...(next[docId] ?? {}), ...patch };
      }
      return next;
    });
  }

  function runAction(action: (fd: FormData) => Promise<void>, fd: FormData, patcher?: () => void) {
    startTransition(async () => {
      await action(fd);
      if (patcher) patcher();
    });
  }

  return (
    <section className="surface-panel-strong rounded-sm">
      <div className="border-b border-[var(--border-subtle)] px-5 py-5">
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="selection-tile p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Most opened</div>
            <div className="mt-2 text-base font-semibold text-[var(--text-primary)]">{topViewed?.doc_title || "No file views yet"}</div>
            <div className="mt-1 text-sm text-[var(--text-muted)]">
              {topViewed ? `${formatNumber(topViewed.views)} total view${topViewed.views === 1 ? "" : "s"}` : "Share a protected link to start seeing engagement."}
            </div>
          </div>
          <div className="selection-tile p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Recently viewed</div>
            <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">{formatNumber(recentlyViewed)}</div>
            <div className="mt-1 text-sm text-[var(--text-muted)]">Files with a recorded last view.</div>
          </div>
          <div className="selection-tile p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Needs a follow-up</div>
            <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">{formatNumber(quietCount)}</div>
            <div className="mt-1 text-sm text-[var(--text-muted)]">Files that have not been opened yet.</div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="view-doc-search" className="text-xs uppercase tracking-[0.14em] text-[var(--text-faint)]">
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
                className="field-input mt-2 w-full rounded-sm px-4 py-3 text-sm"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <span>Show</span>
              <select
                aria-label="Insights page size"
                value={limit}
                onChange={(event) => {
                  const nextLimit = Number(event.target.value);
                  setLimit(nextLimit);
                  syncUrl({ viewLimit: nextLimit });
                }}
                className="field-input rounded-sm px-3 py-3 text-sm"
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
                    "px-3 py-2 text-xs transition rounded-sm",
                    active
                      ? "selection-pill selection-pill-active"
                      : "selection-pill",
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
          <div className="surface-panel-soft rounded-sm p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-sm border border-[var(--border-accent)] bg-[var(--surface-selected)] text-xs font-semibold tracking-[0.2em] text-[var(--accent-primary)]">
              VIEWS
            </div>
            <h2 className="mt-5 text-2xl font-semibold text-[var(--text-primary)]">No file activity yet</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-[var(--text-secondary)]">
              Once you share a protected link, this page will show which files people opened and when they came back.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={overviewUploadPath}
                className="btn-base btn-primary rounded-sm px-5 py-3 text-sm font-semibold"
              >
                Upload file
              </Link>
              <Link href={linksPath} className="btn-base btn-secondary rounded-sm px-4 py-3 text-sm">
                Open shared links
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-5">
          {canManageShares ? (
            <div className="surface-panel-soft flex items-center justify-between rounded-sm px-4 py-3 text-sm text-[var(--text-secondary)]">
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
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : scanState === "MALICIOUS" || scanState === "NEEDS_REVIEW"
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : "border-amber-200 bg-amber-50 text-amber-800";
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
                className="surface-panel rounded-sm p-5"
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

                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-soft)] text-xs font-semibold tracking-[0.16em] text-[var(--text-muted)]">
                        {getExtension(row.doc_title)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`${documentsPath}/${row.doc_id}`} className="truncate text-lg font-semibold text-[var(--text-primary)] hover:text-[var(--accent-primary)]">
                            {row.doc_title || "Untitled file"}
                          </Link>
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] ${statusToneClass}`}>{statusLabel}</span>
                          {row.alias ? (
                            <span className="rounded-sm border border-[var(--border-accent)] bg-[var(--surface-selected)] px-2.5 py-1 text-[11px] text-[var(--accent-primary)]">
                              Protected link active
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-3 max-w-3xl text-sm text-[var(--text-secondary)]">{engagementMessage}</p>

                        <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
                          <span className="rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-1.5">
                            Last viewed {formatRelativeTime(row.last_view)}
                          </span>
                          <span className="rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-1.5">
                            {formatNumber(row.views)} total views
                          </span>
                          <span className="rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-1.5">
                            {formatNumber(row.unique_ips)} unique visits
                          </span>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          <div className="selection-tile rounded-sm p-4">
                            <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Engagement</div>
                            <div className="mt-2 text-sm font-medium text-[var(--text-primary)]">{row.views > 0 ? "People are opening this file" : "Waiting for the first view"}</div>
                            <div className="mt-1 text-xs text-[var(--text-muted)]">Latest activity {formatDateTime(row.last_view)}</div>
                          </div>
                          <div className="selection-tile rounded-sm p-4">
                            <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Security</div>
                            <div className="mt-2 text-sm font-medium text-[var(--text-primary)]">{statusLabel}</div>
                            <div className="mt-1 text-xs text-[var(--text-muted)]">{securityMessage}</div>
                          </div>
                          <div className="selection-tile rounded-sm p-4">
                            <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Next step</div>
                            <div className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                              {row.alias ? "Share or manage the link" : scanState === "CLEAN" ? "Create a protected link" : "Wait for the scan"}
                            </div>
                            <div className="mt-1 text-xs text-[var(--text-muted)]">
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
                          className="btn-base btn-primary rounded-sm px-4 py-3 text-sm font-medium"
                        >
                          {copiedId === row.doc_id ? "Link copied" : "Copy protected link"}
                        </button>
                        <Link
                          href={shareHref}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-base btn-secondary rounded-sm px-4 py-3 text-center text-sm"
                        >
                          Open shared link
                        </Link>
                      </>
                    ) : scanState === "CLEAN" ? (
                      <Link
                        href={`${documentsPath}?createLink=1&docId=${encodeURIComponent(row.doc_id)}`}
                        className="btn-base btn-primary rounded-sm px-4 py-3 text-center text-sm font-semibold"
                      >
                        Create protected link
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="cursor-not-allowed rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3 text-sm text-[var(--text-faint)]"
                      >
                        Sharing unavailable
                      </button>
                    )}

                    <Link
                      href={`${documentsPath}?docQ=${encodeURIComponent(row.doc_title || row.doc_id)}`}
                      className="btn-base btn-secondary rounded-sm px-4 py-3 text-center text-sm"
                    >
                      Open file
                    </Link>
                    <Link
                      href={`${linksPath}?shareQ=${encodeURIComponent(row.alias || row.doc_title || row.doc_id)}`}
                      className="btn-base btn-secondary rounded-sm px-4 py-3 text-center text-sm"
                    >
                      Manage links
                    </Link>

                    {canManageShares && row.alias ? (
                      <details className="selection-tile rounded-sm p-3">
                        <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)]">Advanced controls</summary>
                        <div className="mt-3 space-y-2">
                          <button
                            type="button"
                            onClick={() => {
                              const fd = new FormData();
                              fd.set("docId", row.doc_id);
                              runAction(revokeAllSharesForDocAction, fd);
                            }}
                            disabled={isPending}
                            className="btn-base btn-secondary w-full rounded-sm px-3 py-2 text-sm disabled:opacity-40"
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
                            className="btn-base btn-secondary w-full rounded-sm px-3 py-2 text-sm disabled:opacity-40"
                          >
                            Extend alias 7 days
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const fd = new FormData();
                              fd.set("docId", row.doc_id);
                              runAction(disableAliasForDocAction, fd, () =>
                                applyRowPatch([row.doc_id], { alias: null })
                              );
                            }}
                            disabled={isPending}
                            className="btn-base btn-secondary w-full rounded-sm px-3 py-2 text-sm disabled:opacity-40"
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

      <div className="border-t border-[var(--border-subtle)] px-5 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-[var(--text-muted)]">
            Showing <span className="text-[var(--text-primary)]">{filtered.length}</span> of <span className="text-[var(--text-primary)]">{rows.length}</span> files
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
                  className="btn-base btn-secondary rounded-sm px-3 py-2 text-sm disabled:opacity-40"
                >
                  Revoke selected links
                </button>
                <button
                  type="button"
                  disabled={!anySelected || isPending}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("docIds", JSON.stringify(selectedIds));
                    runAction(bulkDisableAliasesForDocsAction, fd, () =>
                      applyRowPatch(selectedIds, { alias: null })
                    );
                  }}
                  className="btn-base btn-secondary rounded-sm px-3 py-2 text-sm disabled:opacity-40"
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
              className="btn-base btn-secondary rounded-sm px-3 py-2 text-sm disabled:opacity-40"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => setSelected({})}
              className="btn-base btn-secondary rounded-sm px-3 py-2 text-sm"
            >
              Clear selection
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
