"use client";

import { useEffect, useMemo, useState } from "react";

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

function pillClass(active: boolean, revoked: boolean): string {
  if (revoked) return "border-red-400/20 bg-red-400/10 text-red-200";
  if (active) return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  return "border-white/10 bg-white/5 text-white/70";
}

function statusClass(status: RotationJob["status"]): string {
  if (status === "completed") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (status === "running") return "border-blue-500/30 bg-blue-500/10 text-blue-200";
  if (status === "failed") return "border-red-500/30 bg-red-500/10 text-red-200";
  return "border-white/15 bg-white/5 text-white/70";
}

export default function KeyManagementPanel() {
  const [data, setData] = useState<KeysResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keys = useMemo(() => (data && data.ok ? data.keys : []), [data]);
  const activeId = data && data.ok ? data.active_key_id : null;
  const changes = data && data.ok ? data.changes : [];
  const jobs = data && data.ok ? data.jobs : [];
  const jobSummary = data && data.ok ? data.job_summary : { queued: 0, running: 0, failed: 0 };

  const [activateKey, setActivateKey] = useState<string>("");
  const [activateReason, setActivateReason] = useState<string>("");
  const [fromKey, setFromKey] = useState<string>("");
  const [toKey, setToKey] = useState<string>("");
  const [limit, setLimit] = useState<number>(250);

  async function refresh() {
    setError(null);
    const r = await fetch("/api/admin/security/keys", { method: "GET" });
    const j = (await r.json().catch(() => null)) as KeysResponse | null;
    if (!j) {
      setError("Failed to load keys.");
      return;
    }
    setData(j);
    if (!r.ok || !j.ok) setError(j.ok ? "Failed to load keys." : (j.error || "Failed to load keys."));
  }

  useEffect(() => {
    void refresh();
  }, []);

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
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Activate failed.");
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
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Revoke failed.");
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
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to enqueue rotation job.");
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
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Rollback failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass-card-strong rounded-2xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Master key operations</h2>
          <p className="mt-1 text-xs text-white/50">
            Active key switching, async rewrap jobs, and rollback history.
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={busy}
          className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold hover:bg-white/10 disabled:opacity-50"
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
                className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-semibold hover:bg-black/30 disabled:opacity-50"
                title="Revoke key"
              >
                Revoke
              </button>
            </div>
          ))
        ) : (
          <div className="text-sm text-white/60">No keys detected. Configure DOC_MASTER_KEYS.</div>
        )}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-black/30 p-3">
          <div className="text-xs font-semibold text-white/80">Active key switch</div>
          <div className="mt-1 text-[11px] text-white/60">Current: {activeId || "none"}</div>
          <select
            aria-label="Select active key"
            value={activateKey}
            onChange={(e) => setActivateKey(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-xs outline-none focus:border-white/20"
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
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-xs outline-none focus:border-white/20"
          />
          <button
            onClick={() => void onActivate()}
            disabled={busy || !activateKey}
            className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold hover:bg-white/10 disabled:opacity-50"
          >
            Set Active Key
          </button>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/30 p-3 lg:col-span-2">
          <div className="text-xs font-semibold text-white/80">Re-encryption job queue</div>
          <p className="mt-1 text-[11px] text-white/55">
            Jobs are processed by Cloudflare-triggered cron calling `/api/cron/key-rotation`.
          </p>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <select
              aria-label="Rotation from key"
              value={fromKey}
              onChange={(e) => setFromKey(e.target.value)}
              className="rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-xs outline-none focus:border-white/20"
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
              className="rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-xs outline-none focus:border-white/20"
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
              className="rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-xs outline-none focus:border-white/20"
            />
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-white/60">
            <span>Queued: {jobSummary.queued}</span>
            <span>Running: {jobSummary.running}</span>
            <span>Failed: {jobSummary.failed}</span>
          </div>
          <button
            onClick={() => void onEnqueueRotation()}
            disabled={busy || !fromKey || !toKey}
            className="mt-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold hover:bg-white/10 disabled:opacity-50"
          >
            Enqueue Rotation Job
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-black/30 p-3">
          <div className="text-xs font-semibold text-white/80">Recent key changes</div>
          <div className="mt-2 max-h-[360px] space-y-2 overflow-auto pr-1">
            {changes.length ? (
              changes.map((c) => (
                <div key={c.id} className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs">
                  <div className="font-mono text-white/70">{c.created_at}</div>
                  <div className="mt-1 text-white/80">{c.previous_key_id || "none"} → {c.new_key_id}</div>
                  <div className="text-white/50">{c.reason || "no reason"}</div>
                  <button
                    onClick={() => void onRollback(c.id, c.previous_key_id)}
                    disabled={busy || !c.previous_key_id}
                    className="mt-1 rounded border border-white/15 bg-white/5 px-2 py-1 text-[11px] font-semibold hover:bg-white/10 disabled:opacity-40"
                  >
                    Rollback
                  </button>
                </div>
              ))
            ) : (
              <div className="text-xs text-white/60">No key change history available.</div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/30 p-3">
          <div className="text-xs font-semibold text-white/80">Rotation jobs</div>
          <div className="mt-2 max-h-[360px] space-y-2 overflow-auto pr-1">
            {jobs.length ? (
              jobs.map((j) => (
                <div key={j.id} className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-white/70">{j.id.slice(0, 8)}</div>
                    <span className={`rounded-md border px-2 py-0.5 text-[10px] ${statusClass(j.status)}`}>{j.status}</span>
                  </div>
                  <div className="mt-1 text-white/80">{j.from_key_id} → {j.to_key_id}</div>
                  <div className="text-white/55">
                    scanned {j.scanned_count}, rotated {j.rotated_count}, failed {j.failed_count}
                  </div>
                  {j.last_error ? <div className="mt-1 text-red-300">{j.last_error}</div> : null}
                </div>
              ))
            ) : (
              <div className="text-xs text-white/60">No jobs yet.</div>
            )}
          </div>
        </div>
      </div>

      {error ? <div className="mt-3 text-sm text-red-300">{error}</div> : null}
    </section>
  );
}
