"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

type Status = "all" | "active" | "expired" | "maxed" | "revoked";
type StatusFilter = Status | "expiring";

function formatDate(value: string | null) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatShortDate(value: string | null) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatViews(maxViews: number | null, viewCount: number) {
  if (maxViews == null) return `${viewCount} views`;
  if (maxViews === 0) return `${viewCount} views`;
  return `${viewCount} of ${maxViews} views`;
}

function computeStatus(share: ShareRow, nowTs: number): Exclude<Status, "all"> {
  if (share.revoked_at) return "revoked";
  if (share.expires_at && new Date(share.expires_at).getTime() <= nowTs) return "expired";
  if (share.max_views != null && share.max_views !== 0 && share.view_count >= share.max_views) return "maxed";
  return "active";
}

function isExpiringSoon(share: ShareRow, nowTs: number) {
  if (share.revoked_at || !share.expires_at) return false;
  const exp = new Date(share.expires_at).getTime();
  if (Number.isNaN(exp) || exp <= nowTs) return false;
  return exp <= nowTs + 7 * 24 * 60 * 60 * 1000;
}

function statusBadge(status: Exclude<Status, "all">, expiringSoon: boolean) {
  if (status === "active" && expiringSoon) {
    return { label: "Expiring soon", cls: "border-amber-500/25 bg-amber-500/10 text-amber-100" };
  }
  if (status === "revoked") return { label: "Access removed", cls: "border-white/15 bg-white/[0.05] text-white/70" };
  if (status === "expired") return { label: "Expired", cls: "border-rose-500/25 bg-rose-500/10 text-rose-100" };
  if (status === "maxed") return { label: "View limit reached", cls: "border-rose-500/25 bg-rose-500/10 text-rose-100" };
  return { label: "Secure link active", cls: "border-emerald-500/25 bg-emerald-500/10 text-emerald-100" };
}

function buildFilterLabel(filter: StatusFilter, count: number) {
  if (filter === "active") return `Active (${count})`;
  if (filter === "expiring") return `Expiring soon (${count})`;
  if (filter === "expired") return `Expired (${count})`;
  if (filter === "maxed") return `View limit reached (${count})`;
  if (filter === "revoked") return `Removed (${count})`;
  return `All (${count})`;
}

export default function SharesTableClient(props: { shares: ShareRow[]; nowTs: number; canManageBulk?: boolean }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const canManageBulk = Boolean(props.canManageBulk);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const q = (sp.get("shareQ") || "").trim();
  const status = (sp.get("shareStatus") || "all") as StatusFilter;
  const normalizedQ = q.toLowerCase();

  useEffect(() => {
    if (!copiedToken) return;
    const id = window.setTimeout(() => setCopiedToken(null), 1800);
    return () => window.clearTimeout(id);
  }, [copiedToken]);

  const counts = useMemo(() => {
    const next: Record<StatusFilter, number> = {
      all: props.shares.length,
      active: 0,
      expiring: 0,
      expired: 0,
      maxed: 0,
      revoked: 0,
    };
    for (const share of props.shares) {
      const state = computeStatus(share, props.nowTs);
      next[state] += 1;
      if (state === "active" && isExpiringSoon(share, props.nowTs)) next.expiring += 1;
    }
    return next;
  }, [props.nowTs, props.shares]);

  const filtered = useMemo(() => {
    return props.shares.filter((share) => {
      const state = computeStatus(share, props.nowTs);
      const expiring = isExpiringSoon(share, props.nowTs);
      const matchesFilter =
        status === "all" ? true : status === "expiring" ? state === "active" && expiring : state === status;
      if (!matchesFilter) return false;
      if (!normalizedQ) return true;
      const haystack = [
        share.doc_title ?? "",
        share.to_email ?? "",
        share.alias ?? "",
        share.token,
        state,
        expiring ? "expiring" : "",
        share.has_password ? "password protected" : "no password",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQ);
    });
  }, [normalizedQ, props.nowTs, props.shares, status]);

  const selectedTokens = useMemo(() => Object.keys(selected).filter((key) => selected[key]), [selected]);
  const anySelected = selectedTokens.length > 0;
  const activeCount = counts.active;
  const passwordCount = props.shares.filter((share) => share.has_password).length;

  function syncUrl(next: { shareQ?: string; shareStatus?: StatusFilter }) {
    const params = new URLSearchParams(sp.toString());
    if (next.shareQ !== undefined) {
      const value = next.shareQ.trim();
      if (value) params.set("shareQ", value);
      else params.delete("shareQ");
    }
    if (next.shareStatus !== undefined) {
      if (next.shareStatus === "all") params.delete("shareStatus");
      else params.set("shareStatus", next.shareStatus);
    }
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  async function runActionAndRefresh(fn: (fd: FormData) => Promise<void>, fd: FormData) {
    await fn(fd);
    router.refresh();
  }

  function downloadCsvForSelected() {
    const rows = props.shares.filter((share) => selected[share.token]);
    const header = ["token", "doc_id", "doc_title", "recipient", "created_at", "expires_at", "max_views", "view_count", "has_password"].join(",");
    const lines = rows.map((share) =>
      [
        share.token,
        share.doc_id,
        JSON.stringify(share.doc_title || ""),
        JSON.stringify(share.to_email || ""),
        JSON.stringify(share.created_at || ""),
        JSON.stringify(share.expires_at || ""),
        share.max_views == null ? "" : String(share.max_views),
        String(share.view_count ?? 0),
        share.has_password ? "true" : "false",
      ].join(",")
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shared_links_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function copyLink(token: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/s/${encodeURIComponent(token)}`);
    setCopiedToken(token);
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="glass-card-strong rounded-[24px] p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-white/45">All links</div>
          <div className="mt-2 text-2xl font-semibold text-white">{counts.all}</div>
          <div className="mt-1 text-sm text-white/60">Every protected link you have created.</div>
        </div>
        <div className="glass-card-strong rounded-[24px] p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-white/45">Active</div>
          <div className="mt-2 text-2xl font-semibold text-white">{activeCount}</div>
          <div className="mt-1 text-sm text-white/60">Links people can still open now.</div>
        </div>
        <div className="glass-card-strong rounded-[24px] p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-white/45">Expiring soon</div>
          <div className="mt-2 text-2xl font-semibold text-white">{counts.expiring}</div>
          <div className="mt-1 text-sm text-white/60">Good candidates for a quick extension.</div>
        </div>
        <div className="glass-card-strong rounded-[24px] p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-white/45">Password protected</div>
          <div className="mt-2 text-2xl font-semibold text-white">{passwordCount}</div>
          <div className="mt-1 text-sm text-white/60">Links with an extra password step.</div>
        </div>
      </section>

      <section className="glass-card-strong rounded-[30px]">
        <div className="flex flex-col gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-white/45">Find a link fast</div>
              <h2 className="mt-2 text-xl font-semibold text-white">Protected links</h2>
              <p className="mt-2 max-w-2xl text-sm text-white/65">
                Search by file name or recipient, filter by state, then copy or adjust the link without digging through a table.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["all", "active", "expiring", "expired", "maxed", "revoked"] as StatusFilter[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => syncUrl({ shareStatus: item })}
                  className={[
                    "btn-base rounded-full border px-3 py-1.5 text-sm",
                    status === item
                      ? "border-cyan-300/35 bg-cyan-400/14 text-cyan-50"
                      : "border-white/10 bg-white/[0.04] text-white/70 hover:border-white/20 hover:bg-white/[0.08] hover:text-white",
                  ].join(" ")}
                >
                  {buildFilterLabel(item, counts[item])}
                </button>
              ))}
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[360px]">
            <label htmlFor="share-search" className="text-xs text-white/55">
              Search
            </label>
            <input
              id="share-search"
              aria-label="Search shared links"
              value={q}
              onChange={(event) => syncUrl({ shareQ: event.target.value })}
              placeholder="Search by file name, recipient, or link"
              className="w-full rounded-2xl border border-white/14 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-cyan-300/45 focus:outline-none"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-6">
            <div className="rounded-[28px] border border-dashed border-white/16 bg-white/[0.03] p-8 text-center">
              <div className="text-lg font-semibold text-white">No protected links yet</div>
              <div className="mt-2 text-sm text-white/65">
                Create a protected link from Files once a file is ready to share.
              </div>
              <div className="mt-5 flex justify-center gap-3">
                <Link href="/admin/documents" className="btn-base rounded-xl border border-cyan-300/40 bg-cyan-300 px-4 py-2 text-sm font-semibold text-[#07131f] hover:bg-cyan-200">
                  Open files
                </Link>
                <Link href="/admin?openPicker=1" className="btn-base btn-secondary rounded-xl px-4 py-2 text-sm">
                  Upload file
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3 p-5">
            {filtered.map((share) => {
              const state = computeStatus(share, props.nowTs);
              const expiringSoon = isExpiringSoon(share, props.nowTs);
              const badge = statusBadge(state, expiringSoon);

              return (
                <article
                  key={share.token}
                  className="rounded-[28px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-5"
                >
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-semibold text-white">{share.doc_title || "Untitled file"}</div>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] ${badge.cls}`}>{badge.label}</span>
                        {share.has_password ? (
                          <span className="rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/70">
                            Password protected
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-3 text-sm text-white/68">
                        {share.to_email
                          ? `Shared directly with ${share.to_email}.`
                          : "Ready to copy and share with the right person when you need it."}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/55">
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                          Created {formatShortDate(share.created_at)}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                          {share.expires_at ? `Expires ${formatShortDate(share.expires_at)}` : "No expiry set"}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                          {formatViews(share.max_views, share.view_count)}
                        </span>
                        {share.alias ? (
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                            Based on {share.alias}
                          </span>
                        ) : null}
                      </div>

                      <details className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <summary className="cursor-pointer list-none text-sm font-medium text-white">Adjust protection</summary>
                        <div className="mt-4 space-y-4">
                          <SharePasswordForm
                            token={share.token}
                            hasPassword={Boolean(share.has_password)}
                            setAction={async (fd) => runActionAndRefresh(setSharePasswordAction, fd)}
                            clearAction={async (fd) => runActionAndRefresh(clearSharePasswordAction, fd)}
                          />

                          <div className="flex flex-wrap gap-2">
                            <form action={async (fd) => runActionAndRefresh(extendShareExpirationAction, fd)}>
                              <input type="hidden" name="token" value={share.token} />
                              <input type="hidden" name="days" value="7" />
                              <button type="submit" disabled={Boolean(share.revoked_at)} className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm disabled:opacity-40">
                                Extend 7 days
                              </button>
                            </form>
                            <form action={async (fd) => runActionAndRefresh(extendShareExpirationAction, fd)}>
                              <input type="hidden" name="token" value={share.token} />
                              <input type="hidden" name="days" value="30" />
                              <button type="submit" disabled={Boolean(share.revoked_at)} className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm disabled:opacity-40">
                                Extend 30 days
                              </button>
                            </form>
                            <form
                              action={async (fd) => runActionAndRefresh(setShareMaxViewsAction, fd)}
                              onSubmit={(event) => {
                                const input = event.currentTarget.querySelector('input[name="maxViews"]') as HTMLInputElement | null;
                                const value = window.prompt("Set a total view limit. Use 0 for no cap.", share.max_views == null ? "" : String(share.max_views));
                                if (value === null) {
                                  event.preventDefault();
                                  return;
                                }
                                if (input) input.value = value.trim();
                              }}
                            >
                              <input type="hidden" name="token" value={share.token} />
                              <input type="hidden" name="maxViews" defaultValue="" />
                              <button type="submit" disabled={Boolean(share.revoked_at)} className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm disabled:opacity-40">
                                Set view limit
                              </button>
                            </form>
                            <form action={async (fd) => runActionAndRefresh(resetShareViewsCountAction, fd)}>
                              <input type="hidden" name="token" value={share.token} />
                              <button type="submit" disabled={Boolean(share.revoked_at)} className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm disabled:opacity-40">
                                Reset views
                              </button>
                            </form>
                            <form action={async (fd) => runActionAndRefresh(forceSharePasswordResetAction, fd)}>
                              <input type="hidden" name="token" value={share.token} />
                              <button type="submit" disabled={Boolean(share.revoked_at)} className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm disabled:opacity-40">
                                Clear saved password
                              </button>
                            </form>
                          </div>
                        </div>
                      </details>
                    </div>

                    <div className="flex w-full flex-col gap-2 xl:w-[260px]">
                      <button
                        type="button"
                        onClick={() => copyLink(share.token)}
                        className="btn-base rounded-2xl border border-cyan-300/35 bg-cyan-400/14 px-4 py-3 text-sm font-medium text-cyan-100 hover:bg-cyan-400/22"
                      >
                        {copiedToken === share.token ? "Link copied" : "Copy protected link"}
                      </button>
                      <Link
                        href={`/s/${encodeURIComponent(share.token)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-base btn-secondary rounded-2xl px-4 py-3 text-center text-sm"
                      >
                        Open link
                      </Link>
                      <Link href={`/admin/links/${encodeURIComponent(share.token)}`} className="btn-base btn-secondary rounded-2xl px-4 py-3 text-center text-sm">
                        Link detail
                      </Link>
                      <RevokeShareForm
                        token={share.token}
                        revoked={Boolean(share.revoked_at)}
                        action={async (fd) => runActionAndRefresh(revokeDocShareAction, fd)}
                      />
                      <div className="pt-1 text-[11px] text-white/40">
                        Link ID: <span className="font-mono">{share.token.slice(0, 8)}…{share.token.slice(-4)}</span>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-4 text-sm text-white/60 md:flex-row md:items-center md:justify-between">
          <div>
            Showing <span className="text-white">{filtered.length}</span> of <span className="text-white">{props.shares.length}</span> links
          </div>
          <div className="flex flex-wrap gap-2">
            {canManageBulk ? (
              <>
                <form action={async (fd) => runActionAndRefresh(bulkRevokeSharesAction, fd)} onSubmit={(e) => { if (!anySelected) e.preventDefault(); }}>
                  <input type="hidden" name="tokens" value={JSON.stringify(selectedTokens)} />
                  <button type="submit" disabled={!anySelected} className="btn-base btn-danger rounded-xl px-3 py-2 text-sm disabled:opacity-40">
                    Remove selected access
                  </button>
                </form>
                <form
                  action={async (fd) => runActionAndRefresh(bulkExtendSharesAction, fd)}
                  onSubmit={(event) => {
                    if (!anySelected) {
                      event.preventDefault();
                      return;
                    }
                    const days = window.prompt("Extend selected links by how many days?", "7");
                    if (days === null) {
                      event.preventDefault();
                      return;
                    }
                    const input = event.currentTarget.querySelector('input[name="days"]') as HTMLInputElement | null;
                    if (input) input.value = days.trim();
                  }}
                >
                  <input type="hidden" name="tokens" value={JSON.stringify(selectedTokens)} />
                  <input type="hidden" name="days" defaultValue="7" />
                  <button type="submit" disabled={!anySelected} className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm disabled:opacity-40">
                    Extend selected
                  </button>
                </form>
              </>
            ) : null}
            <button type="button" onClick={() => downloadCsvForSelected()} disabled={!anySelected} className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm disabled:opacity-40">
              Export selected
            </button>
            <button type="button" onClick={() => setSelected({})} className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
              Clear selection
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
