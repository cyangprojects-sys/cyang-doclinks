// src/app/admin/dashboard/UnifiedDocsTableClient.tsx
"use client";

import Link from "next/link";
import DeleteDocForm from "../DeleteDocForm";
import { bulkDeleteDocsAction, deleteDocAction } from "../actions";
import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type UnifiedDocRow = {
  doc_id: string;
  doc_title: string | null;
  alias: string | null;
  scan_status: string | null;
  total_views: number;
  last_view: string | null;
  active_shares: number;
  alias_expires_at: string | null;
  alias_is_active: boolean | null;
  alias_revoked_at: string | null;
};

function fmtDate(s: string | null) {
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

function daysUntil(s: string | null): number | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const ms = d.getTime() - Date.now();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

type SortKey =
  | "doc_title"
  | "total_views"
  | "last_view"
  | "active_shares"
  | "alias_expires_at"
  | "status";

type SortDir = "asc" | "desc";

function statusFor(r: UnifiedDocRow): { label: string; tone: "good" | "warn" | "bad" | "muted" } {
  const now = Date.now();
  const isActive = r.alias_is_active ?? true;
  const revoked = !!r.alias_revoked_at;
  const exp = r.alias_expires_at ? new Date(r.alias_expires_at).getTime() : null;
  const expired = exp != null && Number.isFinite(exp) && exp <= now;

  if (!r.alias) return { label: "No alias", tone: "muted" };
  if (!isActive || revoked) return { label: "Disabled", tone: "bad" };
  if (expired) return { label: "Expired", tone: "bad" };

  const d = daysUntil(r.alias_expires_at);
  if (d != null && d >= 0 && d <= 3) return { label: `Expiring (${d}d)`, tone: "warn" };
  return { label: "Active", tone: "good" };
}

function Badge({ label, tone }: { label: string; tone: "good" | "warn" | "bad" | "muted" }) {
  const cls =
    tone === "good"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-100"
      : tone === "warn"
      ? "border-amber-500/25 bg-amber-500/10 text-amber-100"
      : tone === "bad"
      ? "border-rose-500/25 bg-rose-500/10 text-rose-100"
      : "ui-badge";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${cls}`}>{label}</span>;
}

function SortButton({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={`Sort by ${label}`}
      className={`inline-flex items-center gap-1 text-xs font-medium ${active ? "text-white" : "text-white/70 hover:text-white"}`}
      onClick={onClick}
      type="button"
    >
      {label}
      {active ? <span className="text-[10px] text-white/50">{dir === "asc" ? "up" : "down"}</span> : null}
    </button>
  );
}

export default function UnifiedDocsTableClient(props: {
  rows: UnifiedDocRow[];
  defaultPageSize?: number;
  showDelete?: boolean;
}) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const showDelete = !!props.showDelete;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [copiedAlias, setCopiedAlias] = useState<string | null>(null);
  async function copyAliasUrl(alias: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/d/${encodeURIComponent(alias)}`);
      setCopiedAlias(alias);
      window.setTimeout(() => setCopiedAlias((prev) => (prev === alias ? null : prev)), 1200);
    } catch {
      setCopiedAlias(null);
    }
  }

  const q = (sp.get("docQ") || "").trim();
  const pageRaw = Number(sp.get("docPage") || "1");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const pageSizeRaw = Number(sp.get("docPageSize") || String(props.defaultPageSize ?? 10));
  const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? pageSizeRaw : (props.defaultPageSize ?? 10);
  const sortKey = ((sp.get("docSort") || "total_views") as SortKey);
  const sortDir: SortDir = (sp.get("docDir") || "desc") === "asc" ? "asc" : "desc";

  function syncUrl(next: Partial<{ docQ: string; docPage: number; docPageSize: number; docSort: SortKey; docDir: SortDir }>) {
    const params = new URLSearchParams(sp.toString());
    if (next.docQ !== undefined) {
      const v = next.docQ.trim();
      if (v) params.set("docQ", v);
      else params.delete("docQ");
    }
    if (next.docPage !== undefined) params.set("docPage", String(next.docPage));
    if (next.docPageSize !== undefined) params.set("docPageSize", String(next.docPageSize));
    if (next.docSort !== undefined) params.set("docSort", next.docSort);
    if (next.docDir !== undefined) params.set("docDir", next.docDir);
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    router.replace(`${pathname}?${params.toString()}${hash}`, { scroll: false });
  }

  const normalizedQ = q.trim().toLowerCase();

  const hasPendingScans = useMemo(() => {
    return props.rows.some((r) => {
      const s = String(r.scan_status || "unscanned").toLowerCase();
      return s === "pending" || s === "queued" || s === "running" || s === "unscanned";
    });
  }, [props.rows]);

  useEffect(() => {
    if (!hasPendingScans) return;
    const id = window.setInterval(() => {
      router.refresh();
    }, 10_000);
    return () => window.clearInterval(id);
  }, [hasPendingScans, router]);

  const filtered = useMemo(() => {
    if (!normalizedQ) return props.rows;
    return props.rows.filter((r) => {
      const hay = [r.doc_title ?? "", r.alias ?? "", r.doc_id].join(" ").toLowerCase();
      return hay.includes(normalizedQ);
    });
  }, [props.rows, normalizedQ]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const a = [...filtered];
    a.sort((x, y) => {
      const getVal = (r: UnifiedDocRow) => {
        switch (sortKey) {
          case "doc_title":
            return (r.doc_title || "").toLowerCase();
          case "total_views":
            return r.total_views || 0;
          case "last_view":
            return r.last_view ? new Date(r.last_view).getTime() : 0;
          case "active_shares":
            return r.active_shares || 0;
          case "alias_expires_at":
            return r.alias_expires_at ? new Date(r.alias_expires_at).getTime() : 0;
          case "status":
            return r.alias ? statusFor(r).label : "zzzz";
        }
      };
      const vx = getVal(x);
      const vy = getVal(y);
      if (typeof vx === "number" && typeof vy === "number") {
        if (vx === vy) return 0;
        return vx > vy ? dir : -dir;
      }
      const s1 = String(vx);
      const s2 = String(vy);
      if (s1 === s2) return 0;
      return s1 > s2 ? dir : -dir;
    });
    return a;
  }, [filtered, sortKey, sortDir]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, safePage, pageSize]);

  const pageDocIds = pageRows.map((r) => r.doc_id);
  const allPageSelected = pageDocIds.length > 0 && pageDocIds.every((id) => selectedIds.includes(id));
  const anySelected = selectedIds.length > 0;

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((prev) => (checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)));
  }

  function toggleSelectAllOnPage(checked: boolean) {
    setSelectedIds((prev) => {
      if (!checked) return prev.filter((id) => !pageDocIds.includes(id));
      return Array.from(new Set([...prev, ...pageDocIds]));
    });
  }

  function scanBadge(scanStatus: string | null) {
    const s = String(scanStatus || "unscanned").toLowerCase();
    const cls =
      s === "clean"
        ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-100"
        : s === "pending" || s === "queued" || s === "running"
        ? "border-amber-500/25 bg-amber-500/10 text-amber-100"
        : s === "infected" || s === "failed" || s === "quarantined"
        ? "border-rose-500/25 bg-rose-500/10 text-rose-100"
        : "ui-badge";
    return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${cls}`}>{s}</span>;
  }

  function toggleSort(k: SortKey) {
    if (k === sortKey) {
      const nextDir: SortDir = sortDir === "asc" ? "desc" : "asc";
      syncUrl({ docSort: k, docDir: nextDir, docPage: 1 });
      return;
    }
    const nextDir: SortDir = k === "doc_title" || k === "status" ? "asc" : "desc";
    syncUrl({ docSort: k, docDir: nextDir, docPage: 1 });
  }

  return (
    <div className="glass-card-strong mt-4 rounded-2xl">
      <div className="flex flex-col gap-3 p-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="text-xs text-white/60">Search</div>
          <input
            aria-label="Search documents"
            value={q}
            onChange={(e) => {
              syncUrl({ docQ: e.target.value, docPage: 1 });
            }}
            placeholder="title, alias, doc id"
            className="w-full rounded-xl border border-white/20 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/45 focus:border-cyan-300/55 focus:outline-none md:w-[320px]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
          <div>Rows: <span className="text-white">{total}</span></div>
          {showDelete ? (
            <button
              type="button"
              disabled={!anySelected || isPending}
              className="btn-base btn-danger rounded-lg px-3 py-1.5 text-xs disabled:opacity-40"
              onClick={() => {
                if (!anySelected) return;
                const confirmText = window.prompt(`Type DELETE ${selectedIds.length} to confirm bulk deletion.`);
                if (confirmText !== `DELETE ${selectedIds.length}`) return;
                const fd = new FormData();
                fd.set("docIds", JSON.stringify(selectedIds));
                startTransition(() => bulkDeleteDocsAction(fd));
                setSelectedIds([]);
              }}
            >
              {isPending ? "Deleting..." : `Delete selected (${selectedIds.length})`}
            </button>
          ) : null}
          <label className="flex items-center gap-2">
            <span>Page size</span>
            <select
              aria-label="Document table page size"
              value={pageSize}
              onChange={(e) => {
                const next = Number(e.target.value);
                syncUrl({ docPageSize: next, docPage: 1 });
              }}
              className="rounded-lg border border-white/20 bg-black/20 px-2 py-1 text-white"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="max-h-[560px] overflow-auto border-t border-white/10">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#10192b]/95 backdrop-blur">
            <tr>
              {showDelete ? (
                <th className="px-3 py-3 text-left">
                  <input
                    type="checkbox"
                    aria-label="Select all documents on page"
                    checked={allPageSelected}
                    onChange={(e) => toggleSelectAllOnPage(e.target.checked)}
                  />
                </th>
              ) : null}
              <th className="px-4 py-3 text-left"><SortButton label="Doc name" active={sortKey === "doc_title"} dir={sortDir} onClick={() => toggleSort("doc_title")} /></th>
              <th className="px-4 py-3 text-left text-xs text-white/70">Scan</th>
              <th className="px-4 py-3 text-right"><SortButton label="Total views" active={sortKey === "total_views"} dir={sortDir} onClick={() => toggleSort("total_views")} /></th>
              <th className="px-4 py-3 text-left"><SortButton label="Last viewed" active={sortKey === "last_view"} dir={sortDir} onClick={() => toggleSort("last_view")} /></th>
              <th className="px-4 py-3 text-right"><SortButton label="Active shares" active={sortKey === "active_shares"} dir={sortDir} onClick={() => toggleSort("active_shares")} /></th>
              <th className="px-4 py-3 text-left"><SortButton label="Expiration date" active={sortKey === "alias_expires_at"} dir={sortDir} onClick={() => toggleSort("alias_expires_at")} /></th>
              <th className="px-4 py-3 text-left"><SortButton label="Status" active={sortKey === "status"} dir={sortDir} onClick={() => toggleSort("status")} /></th>
              {showDelete ? <th className="px-4 py-3 text-right text-xs text-white/70">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={showDelete ? 9 : 7} className="px-4 py-10 text-white/60">No documents found.</td></tr>
            ) : (
              pageRows.map((r) => {
                const st = statusFor(r);
                return (
                  <tr key={r.doc_id} className="border-t border-white/10 hover:bg-white/[0.03]">
                    {showDelete ? (
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.doc_title || r.doc_id}`}
                          checked={selectedIds.includes(r.doc_id)}
                          onChange={(e) => toggleRow(r.doc_id, e.target.checked)}
                        />
                      </td>
                    ) : null}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <Link aria-label={`Open document ${r.doc_title || r.doc_id}`} href={`/admin/docs/${r.doc_id}`} className="text-white hover:underline" title="Open per-document detail">
                          {r.doc_title || "Untitled"}
                        </Link>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
                          <span className="font-mono">{r.doc_id}</span>
                          {r.alias ? (
                            <button
                              type="button"
                              onClick={() => copyAliasUrl(r.alias as string)}
                              className="rounded-md border border-cyan-500/35 bg-cyan-500/15 px-2 py-0.5 text-[11px] text-cyan-100 hover:bg-cyan-500/25"
                            >
                              {copiedAlias === r.alias ? "Copied" : "Share"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">{scanBadge(r.scan_status)}</td>
                    <td className="px-4 py-3 text-right text-white/90">{r.total_views ?? 0}</td>
                    <td className="px-4 py-3 text-white/80">{fmtDate(r.last_view)}</td>
                    <td className="px-4 py-3 text-right text-white/90">{r.active_shares ?? 0}</td>
                    <td className="px-4 py-3 text-white/80">{fmtDate(r.alias_expires_at)}</td>
                    <td className="px-4 py-3"><Badge label={st.label} tone={st.tone} /></td>
                    {showDelete ? (
                      <td className="px-4 py-3 text-right">
                        <DeleteDocForm docId={r.doc_id} title={r.doc_title || r.alias || r.doc_id} action={deleteDocAction} />
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 border-t border-white/10 p-4 text-xs text-white/60 md:flex-row md:items-center md:justify-between">
        <div>Page <span className="text-white">{safePage}</span> / <span className="text-white">{totalPages}</span></div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => syncUrl({ docPage: 1 })} disabled={safePage <= 1} className="btn-base btn-secondary rounded-lg px-2 py-1 disabled:opacity-40">First</button>
          <button type="button" onClick={() => syncUrl({ docPage: Math.max(1, safePage - 1) })} disabled={safePage <= 1} className="btn-base btn-secondary rounded-lg px-2 py-1 disabled:opacity-40">Prev</button>
          <button type="button" onClick={() => syncUrl({ docPage: Math.min(totalPages, safePage + 1) })} disabled={safePage >= totalPages} className="btn-base btn-secondary rounded-lg px-2 py-1 disabled:opacity-40">Next</button>
          <button type="button" onClick={() => syncUrl({ docPage: totalPages })} disabled={safePage >= totalPages} className="btn-base btn-secondary rounded-lg px-2 py-1 disabled:opacity-40">Last</button>
        </div>
      </div>
    </div>
  );
}
