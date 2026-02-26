import { sql } from "@/lib/db";
import KeyManagementPanel from "./KeyManagementPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmt(n: number) {
  try {
    return Intl.NumberFormat().format(n);
  } catch {
    return String(n);
  }
}

export default async function SecurityTelemetryPage() {
  // Recent security events
  const events = (await sql`
    select
      id::text as id,
      created_at::text as created_at,
      type::text as type,
      severity::text as severity,
      scope::text as scope,
      message::text as message,
      ip_hash::text as ip_hash,
      actor_user_id::text as actor_user_id,
      doc_id::text as doc_id
    from public.security_events
    order by created_at desc
    limit 100
  `) as unknown as Array<{
    id: string;
    created_at: string;
    type: string;
    severity: string;
    scope: string | null;
    message: string | null;
    ip_hash: string | null;
    actor_user_id: string | null;
    doc_id: string | null;
  }>;

  // Top IPs by rate-limit events (last 24h)
  const topIps = (await sql`
    select
      ip_hash::text as ip_hash,
      count(*)::int as hits,
      max(created_at)::text as last_seen
    from public.security_events
    where created_at > now() - interval '24 hours'
      and type in ('rate_limit','upload_throttle')
      and ip_hash is not null
    group by ip_hash
    order by hits desc
    limit 12
  `) as unknown as Array<{ ip_hash: string; hits: number; last_seen: string }>;

  // Decrypt logs (last 24h)
  const decrypts = (await sql`
    select
      count(*)::int as total,
      count(distinct doc_id)::int as docs
    from public.doc_decrypt_log
    where created_at > now() - interval '24 hours'
  `) as unknown as Array<{ total: number; docs: number }>;

  const decryptTotal = Number(decrypts?.[0]?.total ?? 0);
  const decryptDocs = Number(decrypts?.[0]?.docs ?? 0);

  let scanQueueSummary = {
    queued: 0,
    running: 0,
    error: 0,
    deadLetter: 0,
  };
  let deadLetters: Array<{
    id: string;
    created_at: string;
    finished_at: string | null;
    doc_id: string;
    attempts: number;
    last_error: string | null;
    r2_key: string | null;
  }> = [];

  try {
    const queueRows = (await sql`
      select
        sum(case when status = 'queued' then 1 else 0 end)::int as queued,
        sum(case when status = 'running' then 1 else 0 end)::int as running,
        sum(case when status = 'error' then 1 else 0 end)::int as error,
        sum(case when status = 'dead_letter' then 1 else 0 end)::int as dead_letter
      from public.malware_scan_jobs
    `) as unknown as Array<{ queued: number; running: number; error: number; dead_letter: number }>;

    scanQueueSummary = {
      queued: Number(queueRows?.[0]?.queued ?? 0),
      running: Number(queueRows?.[0]?.running ?? 0),
      error: Number(queueRows?.[0]?.error ?? 0),
      deadLetter: Number(queueRows?.[0]?.dead_letter ?? 0),
    };

    deadLetters = (await sql`
      select
        id::text as id,
        created_at::text as created_at,
        finished_at::text as finished_at,
        doc_id::text as doc_id,
        attempts::int as attempts,
        last_error::text as last_error,
        r2_key::text as r2_key
      from public.malware_scan_jobs
      where status = 'dead_letter'
      order by finished_at desc nulls last, created_at desc
      limit 25
    `) as unknown as Array<{
      id: string;
      created_at: string;
      finished_at: string | null;
      doc_id: string;
      attempts: number;
      last_error: string | null;
      r2_key: string | null;
    }>;
  } catch {
    // optional table in some environments
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Security</h1>
          <p className="mt-1 text-sm text-white/60">
            Rate limiting, anomaly signals, and decrypt audit telemetry.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-xs text-white/60">Decrypts (24h)</div>
            <div className="mt-1 text-sm font-semibold">{fmt(decryptTotal)}</div>
            <div className="text-xs text-white/50">Docs: {fmt(decryptDocs)}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-xs text-white/60">Scan queue</div>
            <div className="mt-1 text-sm font-semibold">
              Q {fmt(scanQueueSummary.queued)} | R {fmt(scanQueueSummary.running)} | E {fmt(scanQueueSummary.error)}
            </div>
            <div className="text-xs text-red-300">Dead-letter: {fmt(scanQueueSummary.deadLetter)}</div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <KeyManagementPanel />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-white/10 bg-white/5 p-4 lg:col-span-1">
          <h2 className="text-sm font-semibold">Top abusive IP hashes (24h)</h2>
          <p className="mt-1 text-xs text-white/50">
            Privacy-safe hashes derived from VIEW_SALT.
          </p>
          <div className="mt-3 space-y-2">
            {topIps.length ? (
              topIps.map((r) => (
                <div
                  key={r.ip_hash}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs text-white/80">{r.ip_hash}</div>
                    <div className="mt-0.5 text-[11px] text-white/40">Last: {r.last_seen}</div>
                  </div>
                  <div className="ml-3 text-sm font-semibold">{fmt(Number(r.hits))}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-white/60">No events in the last 24 hours.</div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold">Recent security events</h2>
          <p className="mt-1 text-xs text-white/50">
            These events are best-effort signals (rate limits, spikes, decrypts). Use them as a starting point.
          </p>

          <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-black/30 text-xs text-white/60">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Severity</th>
                  <th className="px-3 py-2">Scope</th>
                  <th className="px-3 py-2">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {events.map((e) => (
                  <tr key={e.id} className="bg-black/10">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-white/60">{e.created_at}</td>
                    <td className="px-3 py-2 font-mono text-xs text-white/80">{e.type}</td>
                    <td className="px-3 py-2">
                      <span
                        className={[
                          "inline-flex items-center rounded-md border px-2 py-0.5 text-xs",
                          e.severity === "high"
                            ? "border-red-500/30 bg-red-500/10 text-red-200"
                            : e.severity === "medium"
                              ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-200"
                              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
                        ].join(" ")}
                      >
                        {e.severity}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-white/70">{e.scope || "—"}</td>
                    <td className="px-3 py-2 text-xs text-white/70">{e.message || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-sm font-semibold">Scan dead-letter queue</h2>
        <p className="mt-1 text-xs text-white/50">
          Jobs here exceeded retry limits and require manual investigation or requeue.
        </p>

        <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/30 text-xs text-white/60">
              <tr>
                <th className="px-3 py-2">Finished</th>
                <th className="px-3 py-2">Doc</th>
                <th className="px-3 py-2">Attempts</th>
                <th className="px-3 py-2">Object key</th>
                <th className="px-3 py-2">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {deadLetters.length ? (
                deadLetters.map((d) => (
                  <tr key={d.id} className="bg-black/10">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-white/60">{d.finished_at || d.created_at}</td>
                    <td className="px-3 py-2 font-mono text-xs text-white/80">{d.doc_id}</td>
                    <td className="px-3 py-2 text-xs text-white/80">{fmt(d.attempts)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-white/60">{d.r2_key || "-"}</td>
                    <td className="px-3 py-2 text-xs text-red-200">{d.last_error || "-"}</td>
                  </tr>
                ))
              ) : (
                <tr className="bg-black/10">
                  <td className="px-3 py-3 text-xs text-white/60" colSpan={5}>
                    No dead-letter scan jobs.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
