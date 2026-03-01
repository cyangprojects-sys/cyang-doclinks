import { sql } from "@/lib/db";
import AbuseActionsClient from "./AbuseActionsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  created_at: string;
  status: string;
  share_token: string | null;
  doc_id: string | null;
  reporter_email: string | null;
  message: string | null;
  ip_hash: string | null;
  user_agent: string | null;

  doc_title: string | null;
  moderation_status: string | null;
  scan_status: string | null;
  risk_level: string | null;
};

export default async function AbuseReportsPage() {
  const rows = (await sql`
    select
      ar.id::text as id,
      ar.created_at::text as created_at,
      ar.status::text as status,
      ar.share_token::text as share_token,
      ar.doc_id::text as doc_id,
      ar.reporter_email::text as reporter_email,
      ar.message::text as message,
      ar.ip_hash::text as ip_hash,
      ar.user_agent::text as user_agent,

      d.title::text as doc_title,
      d.moderation_status::text as moderation_status,
      d.scan_status::text as scan_status,
      d.risk_level::text as risk_level
    from public.abuse_reports ar
    left join public.docs d on d.id = ar.doc_id
    order by ar.created_at desc
    limit 100
  `) as unknown as Row[];

  let blockStats = [{ active_blocks: 0, expired_blocks: 0 }] as Array<{
    active_blocks: number;
    expired_blocks: number;
  }>;
  try {
    blockStats = (await sql`
      select
        count(*) filter (where expires_at is null or expires_at > now())::int as active_blocks,
        count(*) filter (where expires_at is not null and expires_at <= now())::int as expired_blocks
      from public.abuse_ip_blocks
    `) as unknown as Array<{ active_blocks: number; expired_blocks: number }>;
  } catch {
    // Backward-compatible fallback while abuse block tables are being rolled out.
  }

  let activeBlocks = [] as Array<{
    ip_hash: string;
    reason: string;
    source: string | null;
    created_at: string;
    expires_at: string | null;
  }>;
  try {
    activeBlocks = (await sql`
      select
        ip_hash::text as ip_hash,
        reason::text as reason,
        source::text as source,
        created_at::text as created_at,
        expires_at::text as expires_at
      from public.abuse_ip_blocks
      where expires_at is null or expires_at > now()
      order by coalesce(expires_at, now() + interval '100 years') asc, created_at desc
      limit 100
    `) as unknown as Array<{
      ip_hash: string;
      reason: string;
      source: string | null;
      created_at: string;
      expires_at: string | null;
    }>;
  } catch {
    // Backward-compatible fallback while abuse block tables are being rolled out.
  }

  let hitRows = [{ hits_24h: 0 }] as Array<{ hits_24h: number }>;
  try {
    hitRows = (await sql`
      select count(*)::int as hits_24h
      from public.security_events
      where type = 'abuse_ip_block_hit'
        and created_at > now() - interval '24 hours'
    `) as unknown as Array<{ hits_24h: number }>;
  } catch {
    // Backward-compatible fallback if security event type/table is unavailable.
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-white/60">Owner</div>
          <h1 className="mt-1 text-xl font-semibold text-white">Abuse reports</h1>
          <div className="mt-1 text-sm text-white/60">
            Review viewer-submitted reports and take quick moderation actions (disable/quarantine docs, revoke shares).
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-white/60">Active blocked IPs</div>
          <div className="mt-1 text-2xl font-semibold text-white">{Number(blockStats?.[0]?.active_blocks ?? 0)}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-white/60">Expired blocks</div>
          <div className="mt-1 text-2xl font-semibold text-white">{Number(blockStats?.[0]?.expired_blocks ?? 0)}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-white/60">Block hits (24h)</div>
          <div className="mt-1 text-2xl font-semibold text-white">{Number(hitRows?.[0]?.hits_24h ?? 0)}</div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm font-medium text-white">Active blocked IPs</div>
        <div className="mt-1 text-xs text-white/60">Hashed IP only. Expires automatically when TTL passes.</div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="text-white/50">
              <tr>
                <th className="py-2 pr-4">IP hash</th>
                <th className="py-2 pr-4">Reason</th>
                <th className="py-2 pr-4">Source</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4">Expires</th>
              </tr>
            </thead>
            <tbody className="text-white/80">
              {activeBlocks.length ? (
                activeBlocks.map((b) => (
                  <tr key={`${b.ip_hash}:${b.created_at}`} className="border-t border-white/10">
                    <td className="py-2 pr-4 font-mono">{b.ip_hash.slice(0, 18)}…</td>
                    <td className="py-2 pr-4">{b.reason}</td>
                    <td className="py-2 pr-4">{b.source || "—"}</td>
                    <td className="py-2 pr-4">{new Date(b.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-4">{b.expires_at ? new Date(b.expires_at).toLocaleString() : "never"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-3 text-white/60" colSpan={5}>
                    No active blocked IPs.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">No reports yet.</div>
        ) : null}

        {rows.map((r) => (
          <div key={r.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-white">
                  {r.doc_title || "Unknown document"}
                  <span className="ml-2 text-xs font-normal text-white/50">({r.status})</span>
                </div>
                <div className="mt-1 text-xs text-white/60">
                  {new Date(r.created_at).toLocaleString()} • token: {r.share_token ? `${r.share_token.slice(0, 8)}…` : "—"} • doc:{" "}
                  {r.doc_id ? r.doc_id.slice(0, 8) + "…" : "—"}
                </div>
                <div className="mt-1 text-xs text-white/50">
                  moderation: {r.moderation_status || "—"} • scan: {r.scan_status || "—"} • risk: {r.risk_level || "—"}
                </div>
              </div>

              <AbuseActionsClient
                reportId={r.id}
                token={r.share_token}
                docId={r.doc_id}
                currentStatus={r.status}
              />
            </div>

            {r.reporter_email ? (
              <div className="mt-3 text-xs text-white/60">Reporter: {r.reporter_email}</div>
            ) : null}

            {r.message ? (
              <div className="mt-2 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/80">
                {r.message}
              </div>
            ) : null}

            <div className="mt-3 text-xs text-white/40">
              ip_hash: {r.ip_hash ? r.ip_hash.slice(0, 12) + "…" : "—"} • ua:{" "}
              {r.user_agent ? r.user_agent.slice(0, 80) + (r.user_agent.length > 80 ? "…" : "") : "—"}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
