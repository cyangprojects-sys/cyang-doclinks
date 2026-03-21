import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { sql } from "@/lib/db";
import { mfaTableExists } from "@/lib/mfa";
import {
  listOrgMemberships,
  listPendingOrgInvites,
  orgMembershipTablesReady,
} from "@/lib/orgMembership";
import {
  AdminKpiGrid,
  AdminPageIntro,
  AdminSection,
} from "../_components/AdminPagePrimitives";

export const runtime = "nodejs";

function fmtInt(value: number) {
  try {
    return new Intl.NumberFormat().format(value);
  } catch {
    return String(value);
  }
}

export default async function TeamAccessPage() {
  const user = await requireRole("admin");
  if (!user.orgId) redirect("/admin");

  const membershipReady = await orgMembershipTablesReady();
  const members = membershipReady ? await listOrgMemberships(user.orgId) : [];
  const invites = membershipReady ? await listPendingOrgInvites(user.orgId) : [];

  let mfaByUser = new Map<string, boolean>();
  if (await mfaTableExists()) {
    try {
      const rows = (await sql`
        select user_id::text as user_id, enabled_at is not null as enabled
        from public.user_mfa
        where user_id in (
          select user_id
          from public.org_memberships
          where org_id = ${user.orgId}::uuid
            and revoked_at is null
        )
      `) as unknown as Array<{ user_id: string; enabled: boolean }>;
      mfaByUser = new Map(rows.map((row) => [row.user_id, Boolean(row.enabled)]));
    } catch {
      mfaByUser = new Map();
    }
  }

  const ownerCount = members.filter((member) => member.role === "owner" && !member.revoked_at).length;
  const adminCount = members.filter((member) => member.role === "admin" && !member.revoked_at).length;
  const activeMembers = members.filter((member) => !member.revoked_at);
  const mfaCoverage = activeMembers.length
    ? Math.round(
        (activeMembers.filter((member) => mfaByUser.get(member.user_id)).length / activeMembers.length) * 100
      )
    : 0;

  return (
    <div className="space-y-6">
      <AdminPageIntro
        eyebrow="Team Access"
        title="Manage the people who can operate this workspace."
        description="Invite members, adjust roles, review MFA posture, and keep workspace access clean without digging through security internals."
      />

      <AdminKpiGrid
        items={[
          {
            label: "Members",
            value: fmtInt(activeMembers.length),
            hint: "Active operators in this workspace.",
          },
          {
            label: "Pending Invites",
            value: fmtInt(invites.length),
            hint: "Invites waiting to be accepted.",
            tone: invites.length > 0 ? "warning" : "default",
          },
          {
            label: "Admins",
            value: fmtInt(adminCount + ownerCount),
            hint: "Members with elevated operational access.",
          },
          {
            label: "MFA Coverage",
            value: `${fmtInt(mfaCoverage)}%`,
            hint: "Coverage across active members.",
            tone: mfaCoverage < 100 ? "warning" : "default",
          },
        ]}
      />

      <AdminSection
        title="Invite a member"
        description="Invite-only access keeps workspace membership explicit. Owners can invite any role. Admins should only invite viewer or admin members."
      >
        {!membershipReady ? (
          <div className="rounded-sm border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            Membership tables are not installed yet. Run <span className="font-mono">scripts/sql/org_membership_invites.sql</span>.
          </div>
        ) : (
          <form action="/api/admin/security/org-access" method="post" className="grid gap-3 lg:grid-cols-[1.3fr_180px_140px_auto]">
            <input type="hidden" name="action" value="invite" />
            <label className="text-sm text-[var(--text-secondary)]">
              Email
              <input
                name="email"
                type="email"
                required
                placeholder="teammate@company.com"
                className="field-input mt-2 w-full rounded-sm px-4 py-3 text-sm"
              />
            </label>
            <label className="text-sm text-[var(--text-secondary)]">
              Role
              <select
                name="role"
                defaultValue="viewer"
                className="field-input mt-2 w-full rounded-sm px-4 py-3 text-sm"
              >
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
              </select>
            </label>
            <label className="text-sm text-[var(--text-secondary)]">
              Expires
              <input
                name="expires_days"
                type="number"
                min={1}
                max={90}
                defaultValue={7}
                className="field-input mt-2 w-full rounded-sm px-4 py-3 text-sm"
              />
            </label>
            <div className="flex items-end">
              <button type="submit" className="btn-base btn-primary rounded-sm px-4 py-3 text-sm font-semibold">
                Send Invite
              </button>
            </div>
          </form>
        )}
      </AdminSection>

      <AdminSection
        title="Members"
        description="Keep roles explicit and remove access the moment someone should stop operating the workspace."
      >
        <div className="overflow-hidden rounded-sm border border-[var(--border-subtle)] bg-white/92">
          <div className="max-h-[520px] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-[rgba(245,248,252,0.96)] text-xs text-[var(--text-muted)] backdrop-blur">
                <tr>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">MFA</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-primary)]">
                {activeMembers.length ? (
                  activeMembers.map((member) => (
                    <tr key={member.user_id} className="bg-transparent">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[var(--text-primary)]">{member.email}</div>
                        <div className="mt-1 text-xs text-[var(--text-faint)]">{member.user_id}</div>
                      </td>
                      <td className="px-4 py-3">
                        <form action="/api/admin/security/org-access" method="post" className="flex items-center gap-2">
                          <input type="hidden" name="action" value="set_member_role" />
                          <input type="hidden" name="user_id" value={member.user_id} />
                          <select
                            name="role"
                            defaultValue={member.role}
                            className="field-input rounded-sm px-3 py-2 text-sm"
                          >
                            <option value="viewer">Viewer</option>
                            <option value="admin">Admin</option>
                            <option value="owner">Owner</option>
                          </select>
                          <button type="submit" className="btn-base btn-secondary rounded-sm px-3 py-2 text-xs">
                            Save
                          </button>
                        </form>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={[
                            "inline-flex rounded-full border px-2.5 py-1 text-xs",
                            mfaByUser.get(member.user_id)
                              ? "border-emerald-400/30 bg-emerald-400/12 text-emerald-100"
                              : "border-amber-300/30 bg-amber-300/12 text-amber-100",
                          ].join(" ")}
                        >
                          {mfaByUser.get(member.user_id) ? "Enabled" : "Not enabled"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{member.joined_at}</td>
                      <td className="px-4 py-3 text-right">
                        <form action="/api/admin/security/org-access" method="post">
                          <input type="hidden" name="action" value="remove_member" />
                          <input type="hidden" name="user_id" value={member.user_id} />
                          <button type="submit" className="inline-flex rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 transition hover:bg-rose-100">
                            Remove
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="bg-transparent">
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
                      No members yet. Use the invite form to add the first operator.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </AdminSection>

      <AdminSection
        title="Pending invites"
        description="Track invites that are still outstanding and revoke them if they should no longer grant access."
      >
        <div className="overflow-hidden rounded-sm border border-[var(--border-subtle)] bg-white/92">
          <div className="max-h-[400px] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-[rgba(245,248,252,0.96)] text-xs text-[var(--text-muted)] backdrop-blur">
                <tr>
                  <th className="px-4 py-3">Invitee</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Expires</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-primary)]">
                {invites.length ? (
                  invites.map((invite) => (
                    <tr key={invite.id} className="bg-transparent">
                      <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{invite.email}</td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{invite.role}</td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{invite.expires_at}</td>
                      <td className="px-4 py-3 text-right">
                        <form action="/api/admin/security/org-access" method="post">
                          <input type="hidden" name="action" value="revoke_invite" />
                          <input type="hidden" name="invite_id" value={invite.id} />
                          <button type="submit" className="btn-base btn-secondary rounded-sm px-3 py-2 text-xs">
                            Revoke Invite
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="bg-transparent">
                    <td colSpan={4} className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
                      No pending invites right now.
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
