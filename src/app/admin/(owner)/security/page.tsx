import { sql } from "@/lib/db";
import KeyManagementPanel from "./KeyManagementPanel";
import { RBAC_PERMISSIONS, listRolePermissionOverrides, permissionsTableExists } from "@/lib/rbac";
import type { Role } from "@/lib/authz";
import { requireRole } from "@/lib/authz";
import { listOrgMemberships, listPendingOrgInvites, orgMembershipTablesReady } from "@/lib/orgMembership";
import { getSecurityFreezeSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmt(n: number) {
  try {
    return Intl.NumberFormat().format(n);
  } catch {
    return String(n);
  }
}

export default async function SecurityTelemetryPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await props.searchParams) || {};
  const saved = (Array.isArray(sp.saved) ? sp.saved[0] : sp.saved) || "";
  const error = (Array.isArray(sp.error) ? sp.error[0] : sp.error) || "";
  const requeuedRaw = (Array.isArray(sp.requeued) ? sp.requeued[0] : sp.requeued) || "0";
  const requeuedCount = Number.isFinite(Number(requeuedRaw)) ? Number(requeuedRaw) : 0;
  const inviteUrl = (Array.isArray(sp.invite_url) ? sp.invite_url[0] : sp.invite_url) || "";
  const currentUser = await requireRole("owner");
  const freezeSettingsRes = await getSecurityFreezeSettings();
  const freeze = freezeSettingsRes.settings;
  let orgFreezeSupported = false;
  let orgIsFrozen = false;
  if (currentUser.orgId) {
    try {
      const rows = (await sql`
        select
          coalesce(disabled, false) as disabled,
          coalesce(is_active, true) as is_active
        from public.organizations
        where id = ${currentUser.orgId}::uuid
        limit 1
      `) as unknown as Array<{ disabled: boolean; is_active: boolean }>;
      if (rows?.length) {
        orgFreezeSupported = true;
        orgIsFrozen = Boolean(rows[0].disabled) || !Boolean(rows[0].is_active);
      }
    } catch {
      try {
        const rows = (await sql`
          select disabled
          from public.organizations
          where id = ${currentUser.orgId}::uuid
          limit 1
        `) as unknown as Array<{ disabled: boolean }>;
        if (rows?.length) {
          orgFreezeSupported = true;
          orgIsFrozen = Boolean(rows[0].disabled);
        }
      } catch {
        try {
          const rows = (await sql`
            select is_active
            from public.organizations
            where id = ${currentUser.orgId}::uuid
            limit 1
          `) as unknown as Array<{ is_active: boolean }>;
          if (rows?.length) {
            orgFreezeSupported = true;
            orgIsFrozen = !Boolean(rows[0].is_active);
          }
        } catch {
          orgFreezeSupported = false;
        }
      }
    }
  }

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

  const roles: Role[] = ["viewer", "admin", "owner"];
  const membershipTableReady = await orgMembershipTablesReady();
  const orgMembers = membershipTableReady && currentUser.orgId ? await listOrgMemberships(currentUser.orgId) : [];
  const orgInvites = membershipTableReady && currentUser.orgId ? await listPendingOrgInvites(currentUser.orgId) : [];
  const rbacTableReady = await permissionsTableExists();
  const rbacOverrides = rbacTableReady ? await listRolePermissionOverrides() : [];
  const rbacMap = new Map<string, boolean>();
  for (const row of rbacOverrides) {
    rbacMap.set(`${row.permission}:${row.role}`, Boolean(row.allowed));
  }

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

      {saved === "rbac" ? (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          RBAC override updated.
        </div>
      ) : null}
      {error ? (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          RBAC update failed: {error}
        </div>
      ) : null}
      {saved === "org_invite" && inviteUrl ? (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          Invite created: <span className="font-mono break-all">{inviteUrl}</span>
        </div>
      ) : null}
      {saved === "freeze" ? (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          Emergency freeze controls updated.
        </div>
      ) : null}
      {saved === "tenant_frozen" ? (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Tenant emergency freeze enabled.
        </div>
      ) : null}
      {saved === "tenant_unfrozen" ? (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          Tenant emergency freeze disabled.
        </div>
      ) : null}
      {saved === "scan_requeued" ? (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          Requeued {fmt(requeuedCount)} pending scan job(s).
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
        <h2 className="text-sm font-semibold text-red-100">Incident kill-switch controls</h2>
        <p className="mt-1 text-xs text-red-200/80">
          Immediate runtime freeze controls for serve paths. Use minimum scope first (share or alias) before global freeze.
        </p>
        <p className="mt-1 text-xs text-red-200/70">
          Runbook: <span className="font-mono">docs/incident-response-runbook.md</span>
        </p>

        <form action="/api/admin/security/freeze" method="post" className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-black/30 px-3 py-2 text-xs text-red-100">
            <span>Global serve freeze</span>
            <input aria-label="Global serve freeze" type="checkbox" name="globalServeDisabled" value="1" defaultChecked={freeze.globalServeDisabled} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-black/30 px-3 py-2 text-xs text-red-100">
            <span>Share route freeze</span>
            <input aria-label="Share route freeze" type="checkbox" name="shareServeDisabled" value="1" defaultChecked={freeze.shareServeDisabled} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-black/30 px-3 py-2 text-xs text-red-100">
            <span>Alias route freeze</span>
            <input aria-label="Alias route freeze" type="checkbox" name="aliasServeDisabled" value="1" defaultChecked={freeze.aliasServeDisabled} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-black/30 px-3 py-2 text-xs text-red-100">
            <span>Ticket route freeze</span>
            <input aria-label="Ticket route freeze" type="checkbox" name="ticketServeDisabled" value="1" defaultChecked={freeze.ticketServeDisabled} />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded border border-red-400/40 bg-red-500/20 px-3 py-1.5 text-xs text-red-100 hover:bg-red-500/30"
            >
              Save kill-switch state
            </button>
          </div>
        </form>
      </div>

      <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
        <h2 className="text-sm font-semibold text-amber-100">Tenant emergency freeze</h2>
        <p className="mt-1 text-xs text-amber-200/80">
          Freeze only your organization during an incident. This is lower blast-radius than global freeze.
        </p>
        {!orgFreezeSupported ? (
          <div className="mt-2 rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-xs text-amber-200">
            Organization freeze flags are not available in this schema.
          </div>
        ) : (
          <form action="/api/admin/security/tenant-freeze" method="post" className="mt-3 flex items-center gap-3">
            <span
              className={[
                "inline-flex items-center rounded-md border px-2 py-1 text-xs",
                orgIsFrozen
                  ? "border-red-500/40 bg-red-500/20 text-red-100"
                  : "border-emerald-500/40 bg-emerald-500/20 text-emerald-100",
              ].join(" ")}
            >
              {orgIsFrozen ? "Frozen" : "Active"}
            </span>
            <input type="hidden" name="freeze" value={orgIsFrozen ? "0" : "1"} />
            <button
              type="submit"
              className={[
                "rounded border px-3 py-1.5 text-xs",
                orgIsFrozen
                  ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30"
                  : "border-amber-400/40 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30",
              ].join(" ")}
            >
              {orgIsFrozen ? "Unfreeze tenant" : "Freeze tenant"}
            </button>
          </form>
        )}
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
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold">Scan dead-letter queue</h2>
          <form action="/api/admin/security/requeue-scans" method="post">
            <button
              type="submit"
              className="rounded border border-amber-400/40 bg-amber-500/20 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-500/30"
            >
              Requeue pending scans
            </button>
          </form>
        </div>
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

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-sm font-semibold">Organization Membership</h2>
        <p className="mt-1 text-xs text-white/50">
          Invite-only access model for your tenant. Domain allowlists are supplemental, not primary access control.
        </p>

        {!membershipTableReady ? (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Membership tables not found. Run <span className="font-mono">scripts/sql/org_membership_invites.sql</span>.
          </div>
        ) : (
          <>
            <form action="/api/admin/security/org-access" method="post" className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-black/20 p-3">
              <input type="hidden" name="action" value="invite" />
              <label className="text-xs text-white/70">
                Email
                <input aria-label="Invite email" name="email" type="email" required className="mt-1 block rounded border border-white/15 bg-black/40 px-2 py-1 text-xs text-white" />
              </label>
              <label className="text-xs text-white/70">
                Role
                <select aria-label="Invite role" name="role" defaultValue="viewer" className="mt-1 block rounded border border-white/15 bg-black/40 px-2 py-1 text-xs text-white">
                  <option value="viewer">viewer</option>
                  <option value="admin">admin</option>
                  <option value="owner">owner</option>
                </select>
              </label>
              <label className="text-xs text-white/70">
                Expires (days)
                <input aria-label="Invite expiration days" name="expires_days" type="number" min={1} max={90} defaultValue={7} className="mt-1 block w-24 rounded border border-white/15 bg-black/40 px-2 py-1 text-xs text-white" />
              </label>
              <button type="submit" className="rounded border border-white/15 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15">
                Create Invite
              </button>
            </form>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-black/30 text-xs text-white/60">
                  <tr>
                    <th className="px-3 py-2">Member</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Joined</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {orgMembers.map((m) => (
                    <tr key={m.user_id} className="bg-black/10">
                      <td className="px-3 py-2 font-mono text-xs text-white/80">{m.email}</td>
                      <td className="px-3 py-2">
                        <form action="/api/admin/security/org-access" method="post" className="flex items-center gap-2">
                          <input type="hidden" name="action" value="set_member_role" />
                          <input type="hidden" name="user_id" value={m.user_id} />
                          <select aria-label={`Role for ${m.email}`} name="role" defaultValue={m.role} className="rounded border border-white/15 bg-black/40 px-2 py-1 text-xs text-white">
                            <option value="viewer">viewer</option>
                            <option value="admin">admin</option>
                            <option value="owner">owner</option>
                          </select>
                          <button aria-label={`Save role for ${m.email}`} type="submit" className="rounded border border-white/15 bg-white/5 px-2 py-1 text-xs hover:bg-white/10">Save</button>
                        </form>
                      </td>
                      <td className="px-3 py-2 text-xs text-white/60">{m.joined_at}</td>
                      <td className="px-3 py-2">
                        <form action="/api/admin/security/org-access" method="post">
                          <input type="hidden" name="action" value="remove_member" />
                          <input type="hidden" name="user_id" value={m.user_id} />
                          <button aria-label={`Remove member ${m.email}`} type="submit" className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-200 hover:bg-red-500/20">
                            Remove
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-black/30 text-xs text-white/60">
                  <tr>
                    <th className="px-3 py-2">Pending invite</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Expires</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {orgInvites.length ? orgInvites.map((i) => (
                    <tr key={i.id} className="bg-black/10">
                      <td className="px-3 py-2 font-mono text-xs text-white/80">{i.email}</td>
                      <td className="px-3 py-2 text-xs text-white/70">{i.role}</td>
                      <td className="px-3 py-2 text-xs text-white/60">{i.expires_at}</td>
                      <td className="px-3 py-2">
                        <form action="/api/admin/security/org-access" method="post">
                          <input type="hidden" name="action" value="revoke_invite" />
                          <input type="hidden" name="invite_id" value={i.id} />
                          <button aria-label={`Revoke invite for ${i.email}`} type="submit" className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-200 hover:bg-red-500/20">
                            Revoke
                          </button>
                        </form>
                      </td>
                    </tr>
                  )) : (
                    <tr className="bg-black/10">
                      <td colSpan={4} className="px-3 py-2 text-xs text-white/60">No pending invites.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-sm font-semibold">RBAC permission overrides</h2>
        <p className="mt-1 text-xs text-white/50">
          Owner-level policy controls for role permissions. These overrides take precedence over defaults in code.
        </p>

        {!rbacTableReady ? (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            RBAC override table not found. Run <span className="font-mono">scripts/sql/enterprise_rbac.sql</span>.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[740px] text-left text-sm">
              <thead className="bg-black/30 text-xs text-white/60">
                <tr>
                  <th className="px-3 py-2">Permission</th>
                  {roles.map((r) => (
                    <th key={r} className="px-3 py-2 capitalize">{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {RBAC_PERMISSIONS.map((perm) => (
                  <tr key={perm} className="bg-black/10">
                    <td className="px-3 py-2 font-mono text-xs text-white/80">{perm}</td>
                    {roles.map((role) => {
                      const key = `${perm}:${role}`;
                      const allowed = rbacMap.get(key);
                      const current = allowed == null ? "default" : allowed ? "allow" : "deny";
                      return (
                        <td key={key} className="px-3 py-2">
                          <form action="/api/admin/security/rbac" method="post" className="flex items-center gap-2">
                            <input type="hidden" name="permission" value={perm} />
                            <input type="hidden" name="role" value={role} />
                            <select
                              aria-label={`Permission override for ${perm} / ${role}`}
                              name="allowed"
                              defaultValue={current === "deny" ? "0" : "1"}
                              className="rounded border border-white/15 bg-black/40 px-2 py-1 text-xs text-white"
                            >
                              <option value="1">{current === "default" ? "Default/Allow" : "Allow"}</option>
                              <option value="0">Deny</option>
                            </select>
                            <button className="rounded border border-white/15 bg-white/5 px-2 py-1 text-xs hover:bg-white/10" type="submit">
                              Save
                            </button>
                          </form>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
