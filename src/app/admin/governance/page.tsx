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
              <Link href="/admin/security" className="btn-base btn-secondary rounded-sm px-3 py-2 text-sm">
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
                <div key={item.label} className="selection-tile p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">{item.label}</div>
                  <div className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{item.value}</div>
                </div>
              ))}
            </div>
          </AdminSection>

          <AdminSection
            title="Commercial policy posture"
            description="Billing flags define whether plan enforcement and pricing visibility are active at runtime."
            actions={
              <Link href="/admin/billing" className="btn-base btn-secondary rounded-sm px-3 py-2 text-sm">
                Open Billing & Plan
              </Link>
            }
          >
            <div className="grid gap-3 md:grid-cols-3">
              <div className="selection-tile p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Plan Enforcement</div>
                <div className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
                  {billingFlags.flags.enforcePlanLimits ? "Enabled" : "Disabled"}
                </div>
              </div>
              <div className="selection-tile p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Pro Plan</div>
                <div className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
                  {billingFlags.flags.proPlanEnabled ? "Enabled" : "Disabled"}
                </div>
              </div>
              <div className="selection-tile p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Pricing UI</div>
                <div className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
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
              <div className="selection-tile p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Alerts Enabled</div>
                <div className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
                  {expirationAlertSettings.enabled ? "Enabled" : "Disabled"}
                </div>
              </div>
              <div className="selection-tile p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Threshold</div>
                <div className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{expirationAlertSettings.days} days</div>
              </div>
              <div className="selection-tile p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Email Delivery</div>
                <div className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
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
                <button type="submit" className="btn-base btn-primary rounded-sm px-3 py-2 text-sm font-semibold">
                  Run Retention Now
                </button>
              </form>
            }
          >
            <form action={saveRetentionPolicyAction} className="grid gap-4 lg:grid-cols-[1fr_1fr_220px]">
              <label className="selection-tile p-4 text-sm text-[var(--text-secondary)]">
                <span className="flex items-center justify-between gap-3">
                  <span>Enable retention</span>
                  <input type="checkbox" name="enabled" value="1" defaultChecked={retentionSettings.enabled} />
                </span>
                <span className="mt-2 block text-xs text-[var(--text-faint)]">Turns the retention pipeline on for this workspace.</span>
              </label>
              <label className="selection-tile p-4 text-sm text-[var(--text-secondary)]">
                <span className="flex items-center justify-between gap-3">
                  <span>Delete expired shares</span>
                  <input
                    type="checkbox"
                    name="deleteExpiredShares"
                    value="1"
                    defaultChecked={retentionSettings.deleteExpiredShares}
                  />
                </span>
                <span className="mt-2 block text-xs text-[var(--text-faint)]">Removes expired share records after the retention pass.</span>
              </label>
              <label className="selection-tile p-4 text-sm text-[var(--text-secondary)]">
                Share grace days
                <input
                  type="number"
                  min={0}
                  max={365}
                  name="shareGraceDays"
                  defaultValue={retentionSettings.shareGraceDays}
                  className="field-input mt-2 w-full rounded-sm px-3 py-2 text-sm"
                />
                <span className="mt-2 block text-xs text-[var(--text-faint)]">Extra buffer after expiry before retention removes the share.</span>
              </label>
              <div className="lg:col-span-3">
                <button type="submit" className="btn-base btn-secondary rounded-sm px-4 py-2.5 text-sm">
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
              <Link href="/api/admin/audit/export?type=audit" className="btn-base btn-secondary rounded-sm px-3 py-2 text-sm">
                Export Audit CSV
              </Link>
              <Link href="/api/admin/audit/export?type=access" className="btn-base btn-secondary rounded-sm px-3 py-2 text-sm">
                Export Access CSV
              </Link>
              <Link href="/api/admin/audit/export?type=views" className="btn-base btn-secondary rounded-sm px-3 py-2 text-sm">
                Export Views CSV
              </Link>
            </div>
          </AdminSection>

          <AdminSection
            title="Export guidance"
            description="Use audit export for compliance review, access export for delivery traceability, and views export for engagement review."
          >
            <div className="grid gap-3 md:grid-cols-3">
              <div className="selection-tile p-4">
                <div className="text-sm font-medium text-[var(--text-primary)]">Audit CSV</div>
                <div className="mt-2 text-sm text-[var(--text-secondary)]">Administrative changes, actor traces, and immutable event history.</div>
              </div>
              <div className="selection-tile p-4">
                <div className="text-sm font-medium text-[var(--text-primary)]">Access CSV</div>
                <div className="mt-2 text-sm text-[var(--text-secondary)]">Operational access records and document access log snapshots.</div>
              </div>
              <div className="selection-tile p-4">
                <div className="text-sm font-medium text-[var(--text-primary)]">Views CSV</div>
                <div className="mt-2 text-sm text-[var(--text-secondary)]">Document view counts and recent engagement traces for follow-up analysis.</div>
              </div>
            </div>
          </AdminSection>
        </div>
      ) : null}
    </div>
  );
}
