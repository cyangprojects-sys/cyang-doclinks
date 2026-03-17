import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { sql } from "@/lib/db";
import { getSecurityFreezeSettings } from "@/lib/settings";
import KeyManagementPanel from "../(owner)/security/KeyManagementPanel";
import SecurityTablesAutoRefresh from "../(owner)/security/SecurityTablesAutoRefresh";
import {
  AdminKpiGrid,
  AdminPageIntro,
  AdminSection,
} from "../_components/AdminPagePrimitives";

export const runtime = "nodejs";

function fmt(value: number) {
  try {
    return new Intl.NumberFormat().format(value);
  } catch {
    return String(value);
  }
}

export default async function SecurityCenterPage() {
  const user = await requireRole("admin");
  const isOwner = user.role === "owner";
  const freezeSettings = isOwner ? await getSecurityFreezeSettings() : null;

  const [eventRows, topIps, scanQueue, quarantinedDocs] = await Promise.all([
    sql`
      select
        id::text as id,
        created_at::text as created_at,
        type::text as type,
        severity::text as severity,
        scope::text as scope,
        message::text as message
      from public.security_events
      order by created_at desc
      limit 80
    `.catch(() => [] as unknown[]),
    sql`
      select
        ip_hash::text as ip_hash,
        count(*)::int as hits,
        max(created_at)::text as last_seen
      from public.security_events
      where created_at > now() - interval '24 hours'
        and type in ('rate_limit', 'upload_throttle', 'abuse_ip_block_hit')
        and ip_hash is not null
      group by ip_hash
      order by hits desc
      limit 8
    `.catch(() => [] as unknown[]),
    sql`
      select
        sum(case when status = 'queued' then 1 else 0 end)::int as queued,
        sum(case when status = 'running' then 1 else 0 end)::int as running,
        sum(case when status = 'error' then 1 else 0 end)::int as error,
        sum(case when status = 'dead_letter' then 1 else 0 end)::int as dead_letter
      from public.malware_scan_jobs
    `.catch(() => [] as unknown[]),
    sql`
      select
        d.id::text as id,
        coalesce(nullif(trim(d.title::text), ''), nullif(trim(d.original_filename::text), ''), 'Untitled document') as title,
        coalesce(d.scan_status::text, 'unscanned') as scan_status,
        coalesce(d.moderation_status::text, 'active') as moderation_status,
        d.created_at::text as created_at
      from public.docs d
      where lower(coalesce(d.scan_status::text, 'unscanned')) in ('quarantined', 'malicious')
         or lower(coalesce(d.moderation_status::text, 'active')) = 'quarantined'
      order by d.created_at desc
      limit 25
    `.catch(() => [] as unknown[]),
  ]);

  const securityEvents = eventRows as Array<{
    id: string;
    created_at: string;
    type: string;
    severity: string;
    scope: string | null;
    message: string | null;
  }>;
  const abusiveIps = topIps as Array<{ ip_hash: string; hits: number; last_seen: string }>;
  const queue = (scanQueue as Array<{
    queued: number | null;
    running: number | null;
    error: number | null;
    dead_letter: number | null;
  }>)[0] || { queued: 0, running: 0, error: 0, dead_letter: 0 };
  const quarantined = quarantinedDocs as Array<{
    id: string;
    title: string;
    scan_status: string;
    moderation_status: string;
    created_at: string;
  }>;

  const highEvents = securityEvents.filter((event) => String(event.severity || "").toLowerCase() === "high").length;

  return (
    <div className="space-y-6">
      <SecurityTablesAutoRefresh />

      <AdminPageIntro
        eyebrow="Security Center"
        title="Monitor risk, investigate suspicious behavior, and respond fast."
        description="This page keeps security operational instead of abstract: live signals, queue pressure, abusive-source indicators, and the owner-only controls that change blast radius during an incident."
        actions={
          <>
            <Link href="/admin/governance?tab=audit" className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
              Open Audit
            </Link>
            {isOwner ? (
              <Link href="/admin/review?tab=uploads" className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
                Open Review Queue
              </Link>
            ) : null}
          </>
        }
      />

      <AdminKpiGrid
        items={[
          {
            label: "Critical Signals",
            value: fmt(highEvents),
            hint: "High-severity security events in the current window.",
            tone: highEvents > 0 ? "danger" : "default",
          },
          {
            label: "Queued Scans",
            value: fmt(Number(queue.queued ?? 0) + Number(queue.running ?? 0)),
            hint: "Documents waiting on active or queued malware scanning.",
            tone: Number(queue.error ?? 0) > 0 ? "warning" : "default",
          },
          {
            label: "Quarantined Docs",
            value: fmt(quarantined.length),
            hint: "Documents blocked from sharing until they are cleared.",
            tone: quarantined.length > 0 ? "warning" : "default",
          },
          {
            label: "Dead-Letter Jobs",
            value: fmt(Number(queue.dead_letter ?? 0)),
            hint: "Scan jobs that exceeded retry limits.",
            tone: Number(queue.dead_letter ?? 0) > 0 ? "danger" : "default",
          },
        ]}
      />

      {isOwner ? (
        <AdminSection
          title="Owner controls"
          description="These controls affect workspace-wide security posture and should be used deliberately during incidents."
        >
          <div className="grid gap-4 xl:grid-cols-[1.1fr_minmax(0,0.9fr)]">
            <div className="rounded-[24px] border border-red-400/28 bg-red-400/[0.08] p-4">
              <div className="text-sm font-semibold text-red-50">Emergency freeze posture</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {[
                  {
                    label: "Global serve",
                    value: freezeSettings?.settings.globalServeDisabled ? "Frozen" : "Active",
                  },
                  {
                    label: "Share routes",
                    value: freezeSettings?.settings.shareServeDisabled ? "Frozen" : "Active",
                  },
                  {
                    label: "Alias routes",
                    value: freezeSettings?.settings.aliasServeDisabled ? "Frozen" : "Active",
                  },
                  {
                    label: "Ticket routes",
                    value: freezeSettings?.settings.ticketServeDisabled ? "Frozen" : "Active",
                  },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-red-300/20 bg-black/20 p-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-red-100/55">{item.label}</div>
                    <div className="mt-2 text-lg font-semibold text-white">{item.value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <Link href="/admin/governance?tab=policies" className="btn-base rounded-xl border border-red-300/28 bg-red-400/14 px-3 py-2 text-sm text-red-50 hover:bg-red-400/20">
                  Review Policy Controls
                </Link>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
              <KeyManagementPanel />
            </div>
          </div>
        </AdminSection>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_minmax(0,1.1fr)]">
        <AdminSection
          title="Top abusive sources"
          description="Hashed IPs preserve privacy while still highlighting rate-limit pressure and repeat abuse patterns."
        >
          <div className="space-y-3">
            {abusiveIps.length ? (
              abusiveIps.map((row) => (
                <div key={row.ip_hash} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs text-white/82">{row.ip_hash}</div>
                    <div className="mt-1 text-xs text-white/45">Last seen {row.last_seen}</div>
                  </div>
                  <div className="text-lg font-semibold text-white">{fmt(row.hits)}</div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.03] px-4 py-8 text-center text-sm text-white/54">
                No abusive-source signals were recorded in the last 24 hours.
              </div>
            )}
          </div>
        </AdminSection>

        <AdminSection
          title="Recent security events"
          description="Use this stream as the first investigation surface, then move into review or audit when you need deeper evidence."
        >
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <div className="max-h-[520px] overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-[#10192b]/95 text-xs text-white/58 backdrop-blur">
                  <tr>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Severity</th>
                    <th className="px-4 py-3">Scope</th>
                    <th className="px-4 py-3">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {securityEvents.length ? (
                    securityEvents.map((event) => (
                      <tr key={event.id} className="bg-black/10">
                        <td className="px-4 py-3 whitespace-nowrap text-white/58">{event.created_at}</td>
                        <td className="px-4 py-3 font-mono text-xs text-white/82">{event.type}</td>
                        <td className="px-4 py-3">
                          <span
                            className={[
                              "inline-flex rounded-full border px-2.5 py-1 text-[11px]",
                              String(event.severity || "").toLowerCase() === "high"
                                ? "border-rose-400/30 bg-rose-400/12 text-rose-100"
                                : String(event.severity || "").toLowerCase() === "medium"
                                  ? "border-amber-300/30 bg-amber-300/12 text-amber-100"
                                  : "border-white/12 bg-white/[0.05] text-white/72",
                            ].join(" ")}
                          >
                            {event.severity || "low"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-white/62">{event.scope || "workspace"}</td>
                        <td className="px-4 py-3 text-white/72">{event.message || "No message recorded."}</td>
                      </tr>
                    ))
                  ) : (
                    <tr className="bg-black/10">
                      <td colSpan={5} className="px-4 py-10 text-center text-sm text-white/54">
                        No security events were recorded in this environment.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </AdminSection>
      </div>

      <AdminSection
        title="Quarantined documents"
        description="These documents are blocked from sharing until the scan pipeline clears them."
        actions={
          <form action="/api/admin/security/requeue-scans" method="post">
            <input type="hidden" name="scope" value="quarantined" />
            <button type="submit" className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
              Rescan Quarantined
            </button>
          </form>
        }
      >
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <div className="max-h-[360px] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-[#10192b]/95 text-xs text-white/58 backdrop-blur">
                <tr>
                  <th className="px-4 py-3">Document</th>
                  <th className="px-4 py-3">Scan</th>
                  <th className="px-4 py-3">Moderation</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {quarantined.length ? (
                  quarantined.map((doc) => (
                    <tr key={doc.id} className="bg-black/10">
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{doc.title}</div>
                        <div className="mt-1 text-xs text-white/45">{doc.id}</div>
                      </td>
                      <td className="px-4 py-3 text-amber-100">{doc.scan_status}</td>
                      <td className="px-4 py-3 text-amber-100">{doc.moderation_status}</td>
                      <td className="px-4 py-3 text-white/58">{doc.created_at}</td>
                    </tr>
                  ))
                ) : (
                  <tr className="bg-black/10">
                    <td colSpan={4} className="px-4 py-10 text-center text-sm text-white/54">
                      No quarantined documents right now.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </AdminSection>
    </div>
  );
}
