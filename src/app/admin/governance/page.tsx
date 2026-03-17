import Link from "next/link";
import { requireRole } from "@/lib/authz";
import {
  getBillingFlags,
  getExpirationAlertSettings,
  getRetentionSettings,
  getSecurityFreezeSettings,
} from "@/lib/settings";
import AuditPage from "../(owner)/audit/page";
import { saveRetentionPolicyAction } from "../_actions/workspaceSettings";
import {
  AdminPageIntro,
  AdminSection,
  AdminTabs,
} from "../_components/AdminPagePrimitives";

export const runtime = "nodejs";

const DEFAULT_RETENTION_SETTINGS = {
  enabled: true,
  deleteExpiredShares: true,
  shareGraceDays: 0,
};

const DEFAULT_EXPIRATION_ALERT_SETTINGS = {
  enabled: true,
  days: 3,
  emailEnabled: true,
};

const TABS = [
  { key: "audit", label: "Audit", href: "/admin/governance?tab=audit" },
  { key: "policies", label: "Policies", href: "/admin/governance?tab=policies" },
  { key: "retention", label: "Retention", href: "/admin/governance?tab=retention" },
  { key: "exports", label: "Exports", href: "/admin/governance?tab=exports" },
];

export default async function GovernancePage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("owner");
  const params = (await props.searchParams) || {};
  const tabRaw = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const currentTab = TABS.some((tab) => tab.key === tabRaw) ? String(tabRaw) : "audit";

  const [freezeRes, retentionRes, expirationRes, billingFlags] = await Promise.all([
    getSecurityFreezeSettings(),
    getRetentionSettings(),
    getExpirationAlertSettings(),
    getBillingFlags(),
  ]);
  const retentionSettings = retentionRes.ok ? retentionRes.settings : DEFAULT_RETENTION_SETTINGS;
  const expirationAlertSettings = expirationRes.ok
    ? expirationRes.settings
    : DEFAULT_EXPIRATION_ALERT_SETTINGS;

  return (
    <div className="space-y-6">
      <AdminPageIntro
        eyebrow="Audit & Policies"
        title="Control the rules that shape trust across the workspace."
        description="Review immutable history, set policy defaults, manage retention, and export the data owners need for governance and incident response."
      />

      <AdminTabs tabs={TABS} current={currentTab} />

      {currentTab === "audit" ? <AuditPage /> : null}

      {currentTab === "policies" ? (
        <div className="space-y-6">
          <AdminSection
            title="Serve policy posture"
            description="Emergency freeze controls define whether delivery paths stay active during a live incident."
            actions={
              <Link href="/admin/security" className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
                Open Security Center
              </Link>
            }
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Global serve",
                  value: freezeRes.settings.globalServeDisabled ? "Frozen" : "Active",
                },
                {
                  label: "Share routes",
                  value: freezeRes.settings.shareServeDisabled ? "Frozen" : "Active",
                },
                {
                  label: "Alias routes",
                  value: freezeRes.settings.aliasServeDisabled ? "Frozen" : "Active",
                },
                {
                  label: "Ticket routes",
                  value: freezeRes.settings.ticketServeDisabled ? "Frozen" : "Active",
                },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/45">{item.label}</div>
                  <div className="mt-2 text-lg font-semibold text-white">{item.value}</div>
                </div>
              ))}
            </div>
          </AdminSection>

          <AdminSection
            title="Commercial policy posture"
            description="Billing flags define whether plan enforcement and pricing visibility are active at runtime."
            actions={
              <Link href="/admin/billing" className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
                Open Billing & Plan
              </Link>
            }
          >
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-white/45">Plan Enforcement</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {billingFlags.flags.enforcePlanLimits ? "Enabled" : "Disabled"}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-white/45">Pro Plan</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {billingFlags.flags.proPlanEnabled ? "Enabled" : "Disabled"}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-white/45">Pricing UI</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {billingFlags.flags.pricingUiEnabled ? "Visible" : "Hidden"}
                </div>
              </div>
            </div>
          </AdminSection>

          <AdminSection
            title="Notification policy posture"
            description="Expiration alerts are a governance signal: they keep operators aware when access is about to disappear."
          >
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-white/45">Alerts Enabled</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {expirationAlertSettings.enabled ? "Enabled" : "Disabled"}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-white/45">Threshold</div>
                <div className="mt-2 text-lg font-semibold text-white">{expirationAlertSettings.days} days</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-white/45">Email Delivery</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {expirationAlertSettings.emailEnabled ? "Enabled" : "Disabled"}
                </div>
              </div>
            </div>
          </AdminSection>
        </div>
      ) : null}

      {currentTab === "retention" ? (
        <div className="space-y-6">
          <AdminSection
            title="Retention policy"
            description="Use retention to clear expired access artifacts and keep long-lived workspaces from accumulating stale delivery objects."
            actions={
              <form action="/api/admin/retention/run" method="post">
                <button type="submit" className="btn-base rounded-xl border border-cyan-300/38 bg-cyan-300 px-3 py-2 text-sm font-semibold text-[#07131f] hover:bg-cyan-200">
                  Run Retention Now
                </button>
              </form>
            }
          >
            <form action={saveRetentionPolicyAction} className="grid gap-4 lg:grid-cols-[1fr_1fr_220px]">
              <label className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/72">
                <span className="flex items-center justify-between gap-3">
                  <span>Enable retention</span>
                  <input type="checkbox" name="enabled" value="1" defaultChecked={retentionSettings.enabled} />
                </span>
                <span className="mt-2 block text-xs text-white/48">Turns the retention pipeline on for this workspace.</span>
              </label>
              <label className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/72">
                <span className="flex items-center justify-between gap-3">
                  <span>Delete expired shares</span>
                  <input
                    type="checkbox"
                    name="deleteExpiredShares"
                    value="1"
                    defaultChecked={retentionSettings.deleteExpiredShares}
                  />
                </span>
                <span className="mt-2 block text-xs text-white/48">Removes expired share records after the retention pass.</span>
              </label>
              <label className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/72">
                Share grace days
                <input
                  type="number"
                  min={0}
                  max={365}
                  name="shareGraceDays"
                  defaultValue={retentionSettings.shareGraceDays}
                  className="mt-2 w-full rounded-xl border border-white/14 bg-black/20 px-3 py-2 text-sm text-white"
                />
                <span className="mt-2 block text-xs text-white/48">Extra buffer after expiry before retention removes the share.</span>
              </label>
              <div className="lg:col-span-3">
                <button type="submit" className="btn-base rounded-xl border border-white/12 bg-white/[0.06] px-4 py-2.5 text-sm text-white/82 hover:bg-white/[0.1]">
                  Save Retention Policy
                </button>
              </div>
            </form>
          </AdminSection>
        </div>
      ) : null}

      {currentTab === "exports" ? (
        <div className="space-y-6">
          <AdminSection
            title="Export audit history"
            description="Exports remain explicit owner actions so governance data leaves the workspace intentionally."
          >
            <div className="flex flex-wrap gap-2">
              <Link href="/api/admin/audit/export?type=audit" className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
                Export Audit CSV
              </Link>
              <Link href="/api/admin/audit/export?type=access" className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
                Export Access CSV
              </Link>
              <Link href="/api/admin/audit/export?type=views" className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
                Export Views CSV
              </Link>
            </div>
          </AdminSection>

          <AdminSection
            title="Export guidance"
            description="Use audit export for compliance review, access export for delivery traceability, and views export for engagement review."
          >
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-sm font-medium text-white">Audit CSV</div>
                <div className="mt-2 text-sm text-white/62">Administrative changes, actor traces, and immutable event history.</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-sm font-medium text-white">Access CSV</div>
                <div className="mt-2 text-sm text-white/62">Operational access records and document access log snapshots.</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-sm font-medium text-white">Views CSV</div>
                <div className="mt-2 text-sm text-white/62">Document view counts and recent engagement traces for follow-up analysis.</div>
              </div>
            </div>
          </AdminSection>
        </div>
      ) : null}
    </div>
  );
}
