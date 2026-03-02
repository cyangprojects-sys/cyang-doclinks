// src/app/admin/dashboard/SharesTableClient.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import RevokeShareForm from "./RevokeShareForm";
import SharePasswordForm from "./SharePasswordForm";
import {
  revokeDocShareAction,
  setSharePasswordAction,
  clearSharePasswordAction,
  extendShareExpirationAction,
  setShareMaxViewsAction,
  resetShareViewsCountAction,
  forceSharePasswordResetAction,
  bulkRevokeSharesAction,
  bulkExtendSharesAction,
} from "../actions";

export type ShareRow = {
  token: string;
  doc_id: string;
  to_email: string | null;
  created_at: string;
  expires_at: string | null;
  max_views: number | null;
  view_count: number;
  revoked_at: string | null;
  doc_title: string | null;
  alias: string | null;
  has_password: boolean;
};

function fmtDate(s: string | null) {
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

function maxLabel(n: number | null) {
  if (n === null) return "-";
  if (n === 0) return "inf";
  return String(n);
}

type Status = "all" | "active" | "expired" | "maxed" | "revoked";
type StatusFilter = Status | "expiring";

function computeStatus(s: ShareRow, nowTs: number): Exclude<Status, "all"> {
  if (s.revoked_at) return "revoked";
  if (s.expires_at && new Date(s.expires_at).getTime() <= nowTs) return "expired";
  if (s.max_views != null && s.max_views !== 0 && s.view_count >= s.max_views) return "maxed";
  return "active";
}

function statusBadge(status: Exclude<Status, "all">) {
  switch (status) {
    case "revoked":
      return { label: "Revoked", cls: "border-amber-500/25 bg-amber-500/10 text-amber-100" };
    case "expired":
      return { label: "Expired", cls: "border-rose-500/25 bg-rose-500/10 text-rose-100" };
    case "maxed":
      return { label: "Maxed", cls: "border-rose-500/25 bg-rose-500/10 text-rose-100" };
    default:
      return { label: "Active", cls: "border-emerald-500/25 bg-emerald-500/10 text-emerald-100" };
  }
}

export default function SharesTableClient(props: { shares: ShareRow[]; nowTs: number }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [selected, setSelected] = useState<Record<string, boolean>>({});
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

  const q = (sp.get("shareQ") || "").trim();
  const status = (sp.get("shareStatus") || "all") as StatusFilter;
  const nowTs = props.nowTs;

  const normalizedQ = q.trim().toLowerCase();

  const filtered = useMemo(() => {
    return props.shares.filter((s) => {
      const st = computeStatus(s, nowTs);
      if (status !== "all") {
        if (status === "expiring") {
          if (st !== "active") return false;
          if (!s.expires_at) return false;
          const exp = new Date(s.expires_at).getTime();
          const sevenDays = 7 * 24 * 60 * 60 * 1000;
          if (Number.isNaN(exp)) return false;
          if (exp <= nowTs) return false;
          if (exp > nowTs + sevenDays) return false;
        } else if (st !== status) {
          return false;
        }
      }
      if (!normalizedQ) return true;
      const hay = [s.to_email ?? "", s.token, s.doc_title ?? "", s.alias ?? "", s.doc_id, s.has_password ? "password protected" : "no password"].join(" ").toLowerCase();
      return hay.includes(normalizedQ);
    });
  }, [props.shares, normalizedQ, status, nowTs]);

  const counts = useMemo(() => {
    const c = { all: props.shares.length, active: 0, expired: 0, maxed: 0, revoked: 0 };
    for (const s of props.shares) c[computeStatus(s, nowTs)] += 1;
    return c;
  }, [props.shares, nowTs]);

  const expiringCount = useMemo(() => {
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    let n = 0;
    for (const s of props.shares) {
      if (computeStatus(s, nowTs) !== "active") continue;
      if (!s.expires_at) continue;
      const exp = new Date(s.expires_at).getTime();
      if (Number.isNaN(exp)) continue;
      if (exp > nowTs && exp <= nowTs + sevenDays) n += 1;
    }
    return n;
  }, [props.shares, nowTs]);

  function syncUrl(next: { shareQ?: string; shareStatus?: StatusFilter }) {
    const params = new URLSearchParams(sp.toString());
    if (next.shareQ !== undefined) {
      const v = next.shareQ.trim();
      if (v) params.set("shareQ", v);
      else params.delete("shareQ");
    }
    if (next.shareStatus !== undefined) {
      if (next.shareStatus && next.shareStatus !== "all") params.set("shareStatus", next.shareStatus);
      else params.delete("shareStatus");
    }
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}${hash}`, { scroll: false });
  }

  const filteredTokens = useMemo(() => filtered.map((s) => s.token), [filtered]);
  const selectedTokens = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);
  const anySelected = selectedTokens.length > 0;
  const allVisibleSelected = useMemo(() => filteredTokens.length > 0 && filteredTokens.every((t) => selected[t]), [filteredTokens, selected]);

  function toggleAllVisible(next: boolean) {
    setSelected((prev) => {
      const out = { ...prev };
      for (const t of filteredTokens) out[t] = next;
      return out;
    });
  }

  function downloadCsvForSelected() {
    const rows = props.shares.filter((s) => selected[s.token]);
    const header = ["token", "doc_id", "alias", "doc_title", "to_email", "created_at", "expires_at", "max_views", "view_count", "revoked_at", "has_password"].join(",");
    const lines = rows.map((s) =>
      [s.token, s.doc_id, JSON.stringify(s.alias || ""), JSON.stringify(s.doc_title || ""), JSON.stringify(s.to_email || ""), JSON.stringify(s.created_at || ""), JSON.stringify(s.expires_at || ""), s.max_views == null ? "" : String(s.max_views), String(s.view_count ?? 0), JSON.stringify(s.revoked_at || ""), s.has_password ? "true" : "false"].join(",")
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shares_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="glass-card-strong mt-4 rounded-2xl p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div>
            <label htmlFor="share-search" className="block text-xs text-white/60">Search</label>
            <input
              id="share-search"
              aria-label="Search shares"
              value={q}
              onChange={(e) => {
                const v = e.target.value;
                syncUrl({ shareQ: v });
              }}
              placeholder="email, alias, title, token..."
              className="mt-1 w-full rounded-xl border border-white/20 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/45 focus:border-cyan-300/55 focus:outline-none md:w-[360px]"
            />
          </div>
          <div>
            <label htmlFor="share-status" className="block text-xs text-white/60">Status</label>
            <select
              id="share-status"
              aria-label="Filter share status"
              value={status}
              onChange={(e) => {
                const v = e.target.value as StatusFilter;
                syncUrl({ shareStatus: v });
              }}
              className="mt-1 w-full rounded-xl border border-white/20 bg-black/20 px-3 py-2 text-sm text-white focus:border-cyan-300/55 focus:outline-none md:w-[190px]"
            >
              <option value="all">All ({counts.all})</option>
              <option value="active">Active ({counts.active})</option>
              <option value="expiring">Expiring (7d) ({expiringCount})</option>
              <option value="expired">Expired ({counts.expired})</option>
              <option value="maxed">Maxed ({counts.maxed})</option>
              <option value="revoked">Revoked ({counts.revoked})</option>
            </select>
          </div>
          <button
            onClick={() => {
              syncUrl({ shareQ: "", shareStatus: "all" });
            }}
            className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm md:mb-[2px]"
          >
            Reset filters
          </button>
        </div>

        <div className="text-xs text-white/60">
          Showing <span className="text-white">{filtered.length}</span> of <span className="text-white">{props.shares.length}</span>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#10192b]/95 text-white/75 backdrop-blur">
              <tr>
                <th className="w-[44px] px-4 py-3 text-left">
                  <input type="checkbox" checked={allVisibleSelected} onChange={(e) => toggleAllVisible(e.target.checked)} aria-label="Select all visible shares" />
                </th>
                <th className="px-4 py-3 text-left">Recipient</th>
                <th className="px-4 py-3 text-left">Token</th>
                <th className="px-4 py-3 text-left">Doc</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Expires</th>
                <th className="px-4 py-3 text-right">Max</th>
                <th className="px-4 py-3 text-right">Views</th>
                <th className="px-4 py-3 text-right">Password</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-6 text-white/60">No share records match these filters.</td></tr>
              ) : (
                filtered.map((s) => {
                  const st = computeStatus(s, nowTs);
                  const badge = statusBadge(st);
                  const tokenShort = s.token.length > 16 ? `${s.token.slice(0, 8)}...${s.token.slice(-4)}` : s.token;
                  return (
                    <tr key={s.token} className="border-t border-white/10 hover:bg-white/[0.03]">
                      <td className="px-4 py-3 align-top">
                        <input type="checkbox" checked={!!selected[s.token]} onChange={(e) => setSelected((prev) => ({ ...prev, [s.token]: e.target.checked }))} aria-label={`Select ${s.token}`} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-white">{s.to_email || <span className="text-white/55">(public)</span>}</div>
                        <div className="text-xs text-white/55">{fmtDate(s.created_at)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs text-white/90">{tokenShort}</div>
                        <div className="mt-1 text-xs text-white/50">Tokenized access path</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-white">{s.doc_title || "Untitled"}</div>
                        <div className="mt-1 text-xs text-white/55">
                          {s.alias ? (
                            <button
                              type="button"
                              onClick={() => copyAliasUrl(s.alias as string)}
                              className="rounded-md border border-cyan-500/35 bg-cyan-500/15 px-2 py-0.5 text-[11px] text-cyan-100 hover:bg-cyan-500/25"
                            >
                              {copiedAlias === s.alias ? "Copied" : "Share"}
                            </button>
                          ) : (
                            <span className="font-mono">{s.doc_id}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="px-4 py-3 text-white/65">{fmtDate(s.expires_at)}</td>
                      <td className="px-4 py-3 text-right text-white/90">{maxLabel(s.max_views)}</td>
                      <td className="px-4 py-3 text-right text-white/90">{s.view_count ?? 0}</td>
                      <td className="px-4 py-3 text-right">
                        <SharePasswordForm token={s.token} hasPassword={Boolean(s.has_password)} setAction={setSharePasswordAction} clearAction={clearSharePasswordAction} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <form action={extendShareExpirationAction}>
                            <input type="hidden" name="token" value={s.token} />
                            <input type="hidden" name="days" value="7" />
                            <button type="submit" disabled={!!s.revoked_at} className="btn-base btn-secondary rounded-lg px-2.5 py-1.5 text-xs disabled:opacity-40">Extend 7d</button>
                          </form>
                          <form action={extendShareExpirationAction}>
                            <input type="hidden" name="token" value={s.token} />
                            <input type="hidden" name="days" value="30" />
                            <button type="submit" disabled={!!s.revoked_at} className="btn-base btn-secondary rounded-lg px-2.5 py-1.5 text-xs disabled:opacity-40">Extend 30d</button>
                          </form>
                          <form action={resetShareViewsCountAction}>
                            <input type="hidden" name="token" value={s.token} />
                            <button type="submit" disabled={!!s.revoked_at} className="btn-base btn-secondary rounded-lg px-2.5 py-1.5 text-xs disabled:opacity-40">Reset views</button>
                          </form>
                          <form action={forceSharePasswordResetAction}>
                            <input type="hidden" name="token" value={s.token} />
                            <button type="submit" disabled={!!s.revoked_at} className="btn-base btn-secondary rounded-lg px-2.5 py-1.5 text-xs disabled:opacity-40">Clear password</button>
                          </form>
                          <form
                            action={setShareMaxViewsAction}
                            onSubmit={(e) => {
                              const input = (e.currentTarget.querySelector('input[name="maxViews"]') as HTMLInputElement) || null;
                              if (!input) return;
                              const v = window.prompt("Set max views. Use 0 for no cap. Leave blank to clear.", s.max_views == null ? "" : String(s.max_views));
                              if (v === null) {
                                e.preventDefault();
                                return;
                              }
                              input.value = v.trim();
                            }}
                          >
                            <input type="hidden" name="token" value={s.token} />
                            <input type="hidden" name="maxViews" defaultValue="" />
                            <button type="submit" disabled={!!s.revoked_at} className="btn-base btn-secondary rounded-lg px-2.5 py-1.5 text-xs disabled:opacity-40">Set max views</button>
                          </form>
                          <RevokeShareForm token={s.token} revoked={Boolean(s.revoked_at)} action={revokeDocShareAction} />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="text-xs text-white/60">Selected: <span className="text-white">{selectedTokens.length}</span></div>
        <div className="flex flex-wrap gap-2">
          <form action={bulkRevokeSharesAction} onSubmit={(e) => { if (!anySelected) e.preventDefault(); }}>
            <input type="hidden" name="tokens" value={JSON.stringify(selectedTokens)} />
            <button type="submit" disabled={!anySelected} className="btn-base btn-danger rounded-xl px-3 py-2 text-sm disabled:opacity-40">Revoke selected</button>
          </form>
          <form
            action={bulkExtendSharesAction}
            onSubmit={(e) => {
              if (!anySelected) {
                e.preventDefault();
                return;
              }
              const days = window.prompt("Extend expiration by how many days?", "7");
              if (days === null) {
                e.preventDefault();
                return;
              }
              const d = (e.currentTarget.querySelector('input[name="days"]') as HTMLInputElement) || null;
              if (d) d.value = days.trim();
            }}
          >
            <input type="hidden" name="tokens" value={JSON.stringify(selectedTokens)} />
            <input type="hidden" name="days" defaultValue="7" />
            <button type="submit" disabled={!anySelected} className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm disabled:opacity-40">Extend selected</button>
          </form>
          <button type="button" disabled={!anySelected} onClick={() => { if (anySelected) downloadCsvForSelected(); }} className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm disabled:opacity-40">
            Export CSV
          </button>
          <button type="button" onClick={() => setSelected({})} className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
            Clear selected
          </button>
        </div>
      </div>
    </div>
  );
}
