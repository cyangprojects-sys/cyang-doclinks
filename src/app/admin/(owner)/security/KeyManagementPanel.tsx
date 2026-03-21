"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useStatusSignaturePolling } from "@/hooks/useStatusSignaturePolling";
import { dispatchSecurityRefreshWatch } from "./securityRefreshWatch";

type MasterKeyRow = { id: string; active: boolean; revoked: boolean };
type MasterKeyChange = {
  id: string;
  created_at: string;
  changed_by_user_id: string | null;
  previous_key_id: string | null;
  new_key_id: string;
  reason: string | null;
  rollback_of_change_id: string | null;
};
type RotationJob = {
  id: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  from_key_id: string;
  to_key_id: string;
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  scanned_count: number;
  rotated_count: number;
  failed_count: number;
  max_batch: number;
  last_error: string | null;
};
type KeysOk = {
  ok: true;
  configured: boolean;
  active_key_id: string | null;
  db_active_key_id: string | null;
  revoked_active: boolean;
  keys: MasterKeyRow[];
  changes: MasterKeyChange[];
  jobs: RotationJob[];
  job_summary: { queued: number; running: number; failed: number };
};
type KeysErr = { ok: false; error: string; message?: string };
type KeysResponse = KeysOk | KeysErr;
const KEY_PANEL_POLL_START_MS = 15_000;
const KEY_PANEL_POLL_MAX_MS = 60_000;

function keysSignature(payload: KeysResponse | null): string {
  if (!payload || !payload.ok) return "";
  const keys = payload.keys
    .map((k) => `${k.id}:${k.active ? "1" : "0"}:${k.revoked ? "1" : "0"}`)
    .join("|");
  const changes = payload.changes
    .map((c) => `${c.id}:${c.previous_key_id || ""}:${c.new_key_id}:${c.created_at}`)
    .join("|");
  const jobs = payload.jobs
    .map((j) => `${j.id}:${j.status}:${j.scanned_count}:${j.rotated_count}:${j.failed_count}:${j.finished_at || ""}`)
    .join("|");
  return [payload.active_key_id || "", payload.db_active_key_id || "", keys, changes, jobs].join("::");
}

function pillClass(active: boolean, revoked: boolean): string {
  if (revoked) return "border-[rgba(186,71,50,0.18)] bg-[rgba(186,71,50,0.08)] text-[var(--danger)]";
  if (active) return "border-[rgba(47,111,70,0.18)] bg-[rgba(47,111,70,0.08)] text-[var(--success)]";
  return "border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--text-secondary)]";
}

function statusClass(status: RotationJob["status"]): string {
  if (status === "completed") return "border-[rgba(47,111,70,0.18)] bg-[rgba(47,111,70,0.08)] text-[var(--success)]";
  if (status === "running") return "border-[var(--border-accent)] bg-[var(--surface-selected)] text-[var(--accent-primary)]";
  if (status === "failed") return "border-[rgba(186,71,50,0.18)] bg-[rgba(186,71,50,0.08)] text-[var(--danger)]";
  return "border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--text-secondary)]";
}

function toUserError(e: unknown, fallback: string): string {
  if (process.env.NODE_ENV !== "production") {
    return e instanceof Error ? e.message : fallback;
  }
  return fallback;
}

function hasRunningJobs(payload: KeysResponse | null): boolean {
  return Boolean(
    payload &&
      payload.ok &&
      (Number(payload.job_summary.queued ?? 0) > 0 || Number(payload.job_summary.running ?? 0) > 0)
  );
}

export default function KeyManagementPanel() {
  const [data, setData] = useState<KeysResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watchJobs, setWatchJobs] = useState(false);

  const keys = useMemo(() => (data && data.ok ? data.keys : []), [data]);
  const activeId = data && data.ok ? data.active_key_id : null;
  const changes = data && data.ok ? data.changes : [];
  const jobs = data && data.ok ? data.jobs : [];
  const jobSummary = data && data.ok ? data.job_summary : { queued: 0, running: 0, failed: 0 };
  const hasActiveJobs = jobSummary.queued > 0 || jobSummary.running > 0;

  const [activateKey, setActivateKey] = useState<string>("");
  const [activateReason, setActivateReason] = useState<string>("");
  const [fromKey, setFromKey] = useState<string>("");
  const [toKey, setToKey] = useState<string>("");
  const [limit, setLimit] = useState<number>(250);

  const refresh = useCallback(async (opts?: { silent?: boolean }): Promise<KeysResponse | null> => {
    if (!opts?.silent) setError(null);
    const r = await fetch("/api/admin/security/keys", { method: "GET" });
    const j = (await r.json().catch(() => null)) as KeysResponse | null;
    if (!j) {
      if (!opts?.silent) setError("Failed to load keys.");
      return null;
    }
    const nextSignature = keysSignature(j);
    setData((prev) => {
      const previousSignature = keysSignature(prev);
      return previousSignature === nextSignature ? prev : j;
    });
    if ((!r.ok || !j.ok) && !opts?.silent) {
      setError(j.ok ? "Failed to load keys." : (j.error || "Failed to load keys."));
    }
    if (!hasRunningJobs(j)) setWatchJobs(false);
    return j;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useStatusSignaturePolling<KeysResponse>({
    enabled: !busy && (hasActiveJobs || watchJobs),
    initialSignature: keysSignature(data),
    getDelayMs: ({ attempt }) => Math.min(KEY_PANEL_POLL_START_MS * 2 ** attempt, KEY_PANEL_POLL_MAX_MS),
    fetchSnapshot: async () => {
      const next = await refresh({ silent: true });
      return next;
    },
    getSignature: (snapshot) => keysSignature(snapshot),
    evaluate: (snapshot) => {
      const keepWatching = hasRunningJobs(snapshot) || watchJobs;
      return {
        shouldContinue: keepWatching,
      };
    },
  });

  async function onActivate() {
    if (!activateKey) {
      setError("Select a key to activate.");
      return;
    }
    if (!confirm(`Switch active key to "${activateKey}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/security/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key_id: activateKey, reason: activateReason || undefined }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Activate failed.");
      dispatchSecurityRefreshWatch();
      await refresh();
    } catch (e: unknown) {
      setError(toUserError(e, "Activate failed."));
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(id: string) {
    if (!confirm(`Revoke key "${id}"? This blocks decrypts for docs still on this key.`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/security/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key_id: id }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Revoke failed.");
      dispatchSecurityRefreshWatch();
      await refresh();
    } catch (e: unknown) {
      setError(toUserError(e, "Revoke failed."));
    } finally {
      setBusy(false);
    }
  }

  async function onEnqueueRotation() {
    if (!fromKey || !toKey) {
      setError("Select FROM and TO keys.");
      return;
    }
    if (fromKey === toKey) {
      setError("FROM and TO keys must differ.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/security/rotate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          from_key_id: fromKey,
          to_key_id: toKey,
          limit,
          async_job: true,
        }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Failed to enqueue rotation job.");
      setWatchJobs(true);
      dispatchSecurityRefreshWatch();
      await refresh();
    } catch (e: unknown) {
      setError(toUserError(e, "Failed to enqueue rotation job."));
    } finally {
      setBusy(false);
    }
  }

  async function onRollback(changeId: string, previousKeyId: string | null) {
    if (!previousKeyId) return;
    if (!confirm(`Rollback key change to restore "${previousKeyId}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/security/rollback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ change_id: changeId }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Rollback failed.");
      dispatchSecurityRefreshWatch();
      await refresh();
    } catch (e: unknown) {
      setError(toUserError(e, "Rollback failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface-panel-strong p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">Master key operations</h2>
          <p className="mt-1 text-xs text-[var(--text-faint)]">
            Active key switching, async rewrap jobs, and rollback history.
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={busy}
          className="btn-base btn-secondary rounded-sm px-3 py-2 text-xs font-semibold disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {keys.length ? (
          keys.map((k) => (
            <div key={k.id} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${pillClass(k.active, k.revoked)}`}>
              <span className="font-mono">{k.id}</span>
              {k.active ? <span className="text-[10px]">ACTIVE</span> : null}
              {k.revoked ? <span className="text-[10px]">REVOKED</span> : null}
              <button
                disabled={busy || k.revoked}
                onClick={() => void onRevoke(k.id)}
                className="rounded-full border border-[var(--border-subtle)] bg-white px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:opacity-50"
                title="Revoke key"
              >
                Revoke
              </button>
            </div>
          ))
        ) : (
          <div className="text-sm text-[var(--text-secondary)]">No keys detected. Configure DOC_MASTER_KEYS.</div>
        )}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="surface-panel-soft p-3">
          <div className="text-xs font-semibold text-slate-950">Active key switch</div>
          <div className="mt-1 text-[11px] text-[var(--text-secondary)]">Current: {activeId || "none"}</div>
          <select
            aria-label="Select active key"
            value={activateKey}
            onChange={(e) => setActivateKey(e.target.value)}
            className="field-input mt-2 w-full px-2 py-2 text-xs"
          >
            <option value="">Select key...</option>
            {keys.filter((k) => !k.revoked).map((k) => (
              <option key={k.id} value={k.id}>
                {k.id}
              </option>
            ))}
          </select>
          <input
            aria-label="Activation reason"
            type="text"
            value={activateReason}
            onChange={(e) => setActivateReason(e.target.value)}
            placeholder="Reason (optional)"
            className="field-input mt-2 w-full px-2 py-2 text-xs"
          />
          <button
            onClick={() => void onActivate()}
            disabled={busy || !activateKey}
            className="btn-base btn-primary mt-2 w-full rounded-sm px-3 py-2 text-xs font-semibold disabled:opacity-50"
          >
            Set Active Key
          </button>
        </div>

        <div className="surface-panel-soft p-3 lg:col-span-2">
          <div className="text-xs font-semibold text-slate-950">Re-encryption job queue</div>
          <p className="mt-1 text-[11px] text-[var(--text-faint)]">
            Jobs are processed by Cloudflare-triggered cron calling `/api/cron/key-rotation`.
          </p>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <select
              aria-label="Rotation from key"
              value={fromKey}
              onChange={(e) => setFromKey(e.target.value)}
              className="field-input px-2 py-2 text-xs"
            >
              <option value="">FROM key...</option>
              {keys.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.id}
                </option>
              ))}
            </select>
            <select
              aria-label="Rotation to key"
              value={toKey}
              onChange={(e) => setToKey(e.target.value)}
              className="field-input px-2 py-2 text-xs"
            >
              <option value="">TO key...</option>
              {keys.filter((k) => !k.revoked).map((k) => (
                <option key={k.id} value={k.id}>
                  {k.id}
                </option>
              ))}
            </select>
            <input
              aria-label="Rotation batch size"
              type="number"
              min={1}
              max={2000}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value || 250))}
              className="field-input px-2 py-2 text-xs"
            />
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <span>Queued: {jobSummary.queued}</span>
            <span>Running: {jobSummary.running}</span>
            <span>Failed: {jobSummary.failed}</span>
            <span>{hasActiveJobs || watchJobs ? "Watching active jobs" : "Idle until a job starts"}</span>
          </div>
          <button
            onClick={() => void onEnqueueRotation()}
            disabled={busy || !fromKey || !toKey}
            className="btn-base btn-secondary mt-2 rounded-sm px-3 py-2 text-xs font-semibold disabled:opacity-50"
          >
            Enqueue Rotation Job
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="surface-panel-soft p-3">
          <div className="text-xs font-semibold text-slate-950">Recent key changes</div>
          <div className="mt-2 max-h-[360px] space-y-2 overflow-auto pr-1">
            {changes.length ? (
              changes.map((c) => (
                <div key={c.id} className="rounded-sm border border-[var(--border-subtle)] bg-white p-2 text-xs">
                  <div className="font-mono text-[var(--text-secondary)]">{c.created_at}</div>
                  <div className="mt-1 text-slate-950">{c.previous_key_id || "none"} → {c.new_key_id}</div>
                  <div className="text-[var(--text-faint)]">{c.reason || "no reason"}</div>
                  <button
                    onClick={() => void onRollback(c.id, c.previous_key_id)}
                    disabled={busy || !c.previous_key_id}
                    className="btn-base btn-secondary mt-1 rounded-sm px-2 py-1 text-[11px] font-semibold disabled:opacity-40"
                  >
                    Rollback
                  </button>
                </div>
              ))
            ) : (
              <div className="text-xs text-[var(--text-secondary)]">No key change history available.</div>
            )}
          </div>
        </div>

        <div className="surface-panel-soft p-3">
          <div className="text-xs font-semibold text-slate-950">Rotation jobs</div>
          <div className="mt-2 max-h-[360px] space-y-2 overflow-auto pr-1">
            {jobs.length ? (
              jobs.map((j) => (
                <div key={j.id} className="rounded-sm border border-[var(--border-subtle)] bg-white p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-[var(--text-secondary)]">{j.id.slice(0, 8)}</div>
                    <span className={`rounded-sm border px-2 py-0.5 text-[10px] ${statusClass(j.status)}`}>{j.status}</span>
                  </div>
                  <div className="mt-1 text-slate-950">{j.from_key_id} → {j.to_key_id}</div>
                  <div className="text-[var(--text-faint)]">
                    scanned {j.scanned_count}, rotated {j.rotated_count}, failed {j.failed_count}
                  </div>
                  {j.last_error ? <div className="mt-1 text-[var(--danger)]">{j.last_error}</div> : null}
                </div>
              ))
            ) : (
              <div className="text-xs text-[var(--text-secondary)]">No jobs yet.</div>
            )}
          </div>
        </div>
      </div>

      {error ? <div className="mt-3 text-sm text-[var(--danger)]">{error}</div> : null}
    </section>
  );
}
