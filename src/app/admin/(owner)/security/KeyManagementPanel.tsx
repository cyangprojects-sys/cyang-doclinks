"use client";

import { useEffect, useMemo, useState } from "react";

type KeysResponse =
  | {
      ok: true;
      configured: boolean;
      active_key_id: string | null;
      revoked_active: boolean;
      keys: Array<{ id: string; active: boolean; revoked: boolean }>;
    }
  | { ok: false; error: string; message?: string };

function pillClass(active: boolean, revoked: boolean) {
  if (revoked) return "border-red-400/20 bg-red-400/10 text-red-200";
  if (active) return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  return "border-white/10 bg-white/5 text-white/70";
}

export default function KeyManagementPanel() {
  const [data, setData] = useState<KeysResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keys = useMemo(() => ((data && (data as any).ok) ? (data as any).keys as any[] : []), [data]);
  const activeId = (data && (data as any).ok) ? (data as any).active_key_id as (string | null) : null;

  const [fromKey, setFromKey] = useState<string>("");
  const [toKey, setToKey] = useState<string>(""); // optional, blank = active
  const [limit, setLimit] = useState<number>(250);

  async function refresh() {
    setError(null);
    const r = await fetch("/api/admin/security/keys", { method: "GET" });
    const j = (await r.json().catch(() => null)) as KeysResponse | null;
    setData(j);
    if (!r.ok || !j || (j as any).ok === false) {
      setError((j as any)?.error || "Failed to load keys.");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onRevoke(id: string) {
    if (!confirm(`Revoke master key "${id}"?\n\nThis will immediately block decrypt for any documents still using it.`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/security/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key_id: id }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || (j as any).ok === false) throw new Error((j as any)?.error || "Revoke failed.");
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Revoke failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onRotate() {
    if (!fromKey) {
      setError("Select a FROM key.");
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
          to_key_id: toKey || undefined,
          limit,
        }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || (j as any).ok === false) throw new Error((j as any)?.error || "Rotate failed.");
      await refresh();
      alert(`Rotated ${Number((j as any).rotated || 0)} documents.`);
    } catch (e: any) {
      setError(e?.message || "Rotate failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Master key management</h2>
          <p className="mt-1 text-xs text-white/50">
            Keys are sourced from <span className="font-mono text-white/70">DOC_MASTER_KEYS</span>. Revocations are stored in DB to allow instant shutdown.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={busy}
          className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold hover:bg-white/10 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {keys?.length ? (
          keys.map((k) => (
            <div key={k.id} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${pillClass(!!k.active, !!k.revoked)}`}>
              <span className="font-mono">{k.id}</span>
              {k.active ? <span className="text-[10px] opacity-90">ACTIVE</span> : null}
              {k.revoked ? <span className="text-[10px] opacity-90">REVOKED</span> : null}
              <button
                disabled={busy || k.revoked}
                onClick={() => onRevoke(k.id)}
                className="ml-1 rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-semibold hover:bg-black/30 disabled:opacity-50"
                title="Revoke key"
              >
                Revoke
              </button>
            </div>
          ))
        ) : (
          <div className="text-sm text-white/60">No keys detected. Set DOC_MASTER_KEYS.</div>
        )}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-black/30 p-3 lg:col-span-2">
          <div className="text-xs font-semibold text-white/80">Rewrap document keys (rotation)</div>
          <p className="mt-1 text-xs text-white/50">
            Unwraps each document data key with the FROM key and re-wraps it with the TO key (default: active). Content in R2 is unchanged.
          </p>

          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <div>
              <div className="text-[11px] text-white/60">FROM key</div>
              <select
                value={fromKey}
                onChange={(e) => setFromKey(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-xs outline-none focus:border-white/20"
              >
                <option value="">Select…</option>
                {keys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.id}{k.revoked ? " (revoked)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-[11px] text-white/60">TO key (optional)</div>
              <select
                value={toKey}
                onChange={(e) => setToKey(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-xs outline-none focus:border-white/20"
              >
                <option value="">Active ({activeId || "unknown"})</option>
                {keys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.id}{k.active ? " (active)" : ""}{k.revoked ? " (revoked)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-[11px] text-white/60">Batch limit</div>
              <input
                type="number"
                min={1}
                max={2000}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value || 250))}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-xs outline-none focus:border-white/20"
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={onRotate}
              disabled={busy || !fromKey}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold hover:bg-white/10 disabled:opacity-50"
            >
              {busy ? "Working…" : "Rotate (rewrap) batch"}
            </button>
            <div className="text-xs text-white/50">
              Tip: rotate docs off a key before revoking it.
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/30 p-3">
          <div className="text-xs font-semibold text-white/80">Operational notes</div>
          <ul className="mt-2 space-y-2 text-xs text-white/55">
            <li>• Revocation is instant (DB-backed).</li>
            <li>• Rotation is safe and does not touch R2 objects.</li>
            <li>• Uploads always use the active key from env.</li>
            <li>• Keep at least 2 keys in env for seamless rotation.</li>
          </ul>
        </div>
      </div>

      {error && <div className="mt-3 text-sm text-red-300">{error}</div>}
    </section>
  );
}
