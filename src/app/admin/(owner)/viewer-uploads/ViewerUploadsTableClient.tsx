"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  bulkDeleteDocsAction,
  bulkRevokeAllSharesForDocsAction,
  deleteDocAction,
  revokeAllSharesForDocAction,
} from "@/app/admin/actions";

export type ViewerUploadRow = {
  doc_id: string;
  title: string | null;
  uploader_email: string | null;
  uploader_role: string | null;
  created_at: string | null;
  size_bytes: number | null;
  moderation_status: string | null;
  scan_status: string | null;
  risk_level: string | null;
  alias: string | null;
  active_shares: number;
  total_views: number;
};

type SortKey = "created_at" | "title" | "uploader_email" | "size_bytes" | "total_views" | "active_shares";

function fmtBytes(n: number | null) {
  if (!n || !Number.isFinite(n)) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fmtDate(s: string | null) {
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

export default function ViewerUploadsTableClient({ rows }: { rows: ViewerUploadRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [moderation, setModeration] = useState("all");
  const [scan, setScan] = useState("all");
  const [risk, setRisk] = useState("all");
  const [recent, setRecent] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDesc, setSortDesc] = useState(true);
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const now = Date.now();
    return rows
      .filter((r) => {
        if (query) {
          const hay = `${r.doc_id} ${r.title || ""} ${r.alias || ""} ${r.uploader_email || ""}`.toLowerCase();
          if (!hay.includes(query)) return false;
        }
        if (moderation !== "all" && String(r.moderation_status || "active").toLowerCase() !== moderation) return false;
        if (scan !== "all" && String(r.scan_status || "unscanned").toLowerCase() !== scan) return false;
        if (risk !== "all" && String(r.risk_level || "low").toLowerCase() !== risk) return false;
        if (recent !== "all") {
          const created = r.created_at ? new Date(r.created_at).getTime() : 0;
          const days = recent === "24h" ? 1 : recent === "7d" ? 7 : 30;
          if (!created || created < now - days * 24 * 60 * 60 * 1000) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const dir = sortDesc ? -1 : 1;
        const av =
          sortKey === "created_at"
            ? new Date(a.created_at || 0).getTime()
            : sortKey === "size_bytes"
              ? Number(a.size_bytes || 0)
              : sortKey === "total_views"
                ? Number(a.total_views || 0)
                : sortKey === "active_shares"
                  ? Number(a.active_shares || 0)
                  : String((a as any)[sortKey] || "").toLowerCase();
        const bv =
          sortKey === "created_at"
            ? new Date(b.created_at || 0).getTime()
            : sortKey === "size_bytes"
              ? Number(b.size_bytes || 0)
              : sortKey === "total_views"
                ? Number(b.total_views || 0)
                : sortKey === "active_shares"
                  ? Number(b.active_shares || 0)
                  : String((b as any)[sortKey] || "").toLowerCase();
        if (av === bv) return 0;
        return av > bv ? dir : -dir;
      });
  }, [rows, q, moderation, scan, risk, recent, sortKey, sortDesc]);

  const selectedIds = useMemo(() => filtered.map((r) => r.doc_id).filter((id) => selected[id]), [filtered, selected]);
  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected[r.doc_id]);

  function setAllVisible(v: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      for (const r of filtered) next[r.doc_id] = v;
      return next;
    });
  }

  async function runAbuseAction(action: "quarantine_doc" | "disable_doc", docIds: string[]) {
    setError(null);
    if (!docIds.length) return;
    startTransition(async () => {
      try {
        for (const docId of docIds) {
          const res = await fetch("/api/admin/abuse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action,
              docId,
              reason: reason || null,
            }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok || !json?.ok) throw new Error(json?.error || json?.message || "Action failed");
        }
        window.location.reload();
      } catch (e: any) {
        setError(e?.message || "Action failed");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
          <div className="xl:col-span-2">
            <label htmlFor="viewer-uploads-search" className="sr-only">Search uploads</label>
            <input
              id="viewer-uploads-search"
              aria-label="Search uploads"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title, alias, uploader, doc id"
              className="w-full rounded-lg border border-neutral-800 bg-black/30 px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="xl:col-span-2">
          <label htmlFor="viewer-uploads-moderation" className="sr-only">Moderation filter</label>
          <select id="viewer-uploads-moderation" aria-label="Moderation filter" value={moderation} onChange={(e) => setModeration(e.target.value)} className="w-full rounded-lg border border-neutral-800 bg-black/30 px-3 py-2 text-sm">
            <option value="all">Moderation: all</option>
            <option value="active">Active</option>
            <option value="quarantined">Quarantined</option>
            <option value="disabled">Disabled</option>
            <option value="deleted">Deleted</option>
          </select>
          </div>
          <div className="xl:col-span-2">
          <label htmlFor="viewer-uploads-scan" className="sr-only">Scan status filter</label>
          <select id="viewer-uploads-scan" aria-label="Scan status filter" value={scan} onChange={(e) => setScan(e.target.value)} className="w-full rounded-lg border border-neutral-800 bg-black/30 px-3 py-2 text-sm">
            <option value="all">Scan: all</option>
            <option value="clean">Clean</option>
            <option value="risky">Risky</option>
            <option value="quarantined">Quarantined</option>
            <option value="error">Error</option>
            <option value="failed">Failed</option>
            <option value="unscanned">Unscanned</option>
          </select>
          </div>
          <div className="xl:col-span-2">
          <label htmlFor="viewer-uploads-risk" className="sr-only">Risk filter</label>
          <select id="viewer-uploads-risk" aria-label="Risk filter" value={risk} onChange={(e) => setRisk(e.target.value)} className="w-full rounded-lg border border-neutral-800 bg-black/30 px-3 py-2 text-sm">
            <option value="all">Risk: all</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          </div>
          <div className="xl:col-span-2">
          <label htmlFor="viewer-uploads-recent" className="sr-only">Created date filter</label>
          <select id="viewer-uploads-recent" aria-label="Created date filter" value={recent} onChange={(e) => setRecent(e.target.value)} className="w-full rounded-lg border border-neutral-800 bg-black/30 px-3 py-2 text-sm">
            <option value="all">Created: all</option>
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7d</option>
            <option value="30d">Last 30d</option>
          </select>
          </div>
          <div className="xl:col-span-2">
            <label htmlFor="viewer-uploads-reason" className="sr-only">Action reason</label>
            <input
              id="viewer-uploads-reason"
              aria-label="Action reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Action reason (logged)"
              className="w-full rounded-lg border border-neutral-800 bg-black/30 px-3 py-2 text-sm text-white"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
          <span>Rows: {filtered.length}</span>
          <span>Selected: {selectedIds.length}</span>
          <span className="ml-2">Sort:</span>
          {(["created_at", "title", "uploader_email", "size_bytes", "total_views", "active_shares"] as SortKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                if (sortKey === k) setSortDesc((d) => !d);
                else {
                  setSortKey(k);
                  setSortDesc(true);
                }
              }}
              className={`rounded-md px-2 py-1 ${sortKey === k ? "bg-white/20 text-white" : "bg-white/5 text-white/80"}`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</div> : null}

      <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={isPending || !selectedIds.length} onClick={() => runAbuseAction("quarantine_doc", selectedIds)} className="rounded-md border border-amber-600/40 bg-amber-500/20 px-3 py-1.5 text-sm text-amber-100 disabled:opacity-50">
            Quarantine selected
          </button>
          <button type="button" disabled={isPending || !selectedIds.length} onClick={() => runAbuseAction("disable_doc", selectedIds)} className="rounded-md border border-amber-600/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-100 disabled:opacity-50">
            Disable selected
          </button>
          <form
            action={(fd) => {
              if (!selectedIds.length) return;
              if (!window.confirm(`Revoke all shares for ${selectedIds.length} selected docs?`)) return;
              fd.set("docIds", JSON.stringify(selectedIds));
              startTransition(() => bulkRevokeAllSharesForDocsAction(fd));
            }}
          >
            <input type="hidden" name="docIds" value="[]" />
            <button type="submit" disabled={isPending || !selectedIds.length} className="rounded-md border border-neutral-700 bg-white/5 px-3 py-1.5 text-sm disabled:opacity-50">
              Revoke shares
            </button>
          </form>
          <form
            action={(fd) => {
              if (!selectedIds.length) return;
              const confirm = window.prompt(`Type DELETE ${selectedIds.length} to confirm bulk deletion.`);
              if (confirm !== `DELETE ${selectedIds.length}`) return;
              fd.set("docIds", JSON.stringify(selectedIds));
              fd.set("reason", reason || "");
              startTransition(() => bulkDeleteDocsAction(fd));
            }}
          >
            <input type="hidden" name="docIds" value="[]" />
            <input type="hidden" name="reason" value={reason} />
            <button type="submit" disabled={isPending || !selectedIds.length} className="rounded-md border border-red-700/60 bg-red-700/20 px-3 py-1.5 text-sm text-red-100 disabled:opacity-50">
              Delete selected
            </button>
          </form>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-800">
        <table className="min-w-[1180px] w-full text-sm">
          <thead className="bg-neutral-900 text-neutral-300">
            <tr>
              <th className="px-3 py-2 text-left">
                <input type="checkbox" aria-label="Select all visible uploads" checked={allVisibleSelected} onChange={(e) => setAllVisible(e.target.checked)} />
              </th>
              <th className="px-3 py-2 text-left">Document</th>
              <th className="px-3 py-2 text-left">Uploader</th>
              <th className="px-3 py-2 text-left">Created</th>
              <th className="px-3 py-2 text-right">Size</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Views</th>
              <th className="px-3 py-2 text-right">Shares</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.doc_id} className="border-t border-neutral-800 bg-black/20">
                <td className="px-3 py-2 align-top">
                  <input type="checkbox" aria-label={`Select upload ${r.title || r.doc_id}`} checked={!!selected[r.doc_id]} onChange={(e) => setSelected((prev) => ({ ...prev, [r.doc_id]: e.target.checked }))} />
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium text-white">{r.title || "Untitled"}</div>
                  <div className="font-mono text-xs text-neutral-400">{r.doc_id}</div>
                  {r.alias ? <Link className="text-xs text-sky-300 hover:underline" href={`/d/${r.alias}`} target="_blank">/d/{r.alias}</Link> : null}
                </td>
                <td className="px-3 py-2">
                  <div>{r.uploader_email || "-"}</div>
                  <div className="text-xs text-neutral-500">{r.uploader_role || "viewer"}</div>
                </td>
                <td className="px-3 py-2">{fmtDate(r.created_at)}</td>
                <td className="px-3 py-2 text-right">{fmtBytes(r.size_bytes)}</td>
                <td className="px-3 py-2">
                  <div className="text-xs">mod: {r.moderation_status || "active"}</div>
                  <div className="text-xs">scan: {r.scan_status || "unscanned"}</div>
                  <div className="text-xs">risk: {r.risk_level || "low"}</div>
                </td>
                <td className="px-3 py-2 text-right">{r.total_views}</td>
                <td className="px-3 py-2 text-right">{r.active_shares}</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Link aria-label={`Open upload ${r.title || r.doc_id}`} href={`/admin/docs/${r.doc_id}`} className="rounded-md border border-neutral-700 bg-white/5 px-2 py-1 text-xs">Open</Link>
                    <button aria-label={`Quarantine upload ${r.title || r.doc_id}`} type="button" onClick={() => runAbuseAction("quarantine_doc", [r.doc_id])} className="rounded-md border border-amber-700/50 bg-amber-700/20 px-2 py-1 text-xs text-amber-100">Quarantine</button>
                    <button aria-label={`Disable upload ${r.title || r.doc_id}`} type="button" onClick={() => runAbuseAction("disable_doc", [r.doc_id])} className="rounded-md border border-amber-700/50 bg-amber-700/10 px-2 py-1 text-xs text-amber-100">Disable</button>
                    <form
                      action={(fd) => {
                        if (!window.confirm("Revoke all shares for this document?")) return;
                        startTransition(() => revokeAllSharesForDocAction(fd));
                      }}
                    >
                      <input type="hidden" name="docId" value={r.doc_id} />
                      <button aria-label={`Revoke all shares for upload ${r.title || r.doc_id}`} type="submit" className="rounded-md border border-neutral-700 bg-white/5 px-2 py-1 text-xs">Revoke shares</button>
                    </form>
                    <form
                      action={(fd) => {
                        const confirm = window.prompt(`Type DELETE to remove "${r.title || r.doc_id}".`);
                        if (confirm !== "DELETE") return;
                        fd.set("reason", reason || "");
                        startTransition(() => deleteDocAction(fd));
                      }}
                    >
                      <input type="hidden" name="docId" value={r.doc_id} />
                      <input type="hidden" name="reason" value={reason} />
                      <button aria-label={`Delete upload ${r.title || r.doc_id}`} type="submit" className="rounded-md border border-red-700/60 bg-red-700/20 px-2 py-1 text-xs text-red-100">Delete</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-neutral-400">No viewer uploads matched your filters.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
