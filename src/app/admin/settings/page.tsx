import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { classifyBillingEntitlement, getBillingSnapshotForUser } from "@/lib/billingSubscription";
import { getPlanForUser } from "@/lib/monetization";
import { PACKS } from "@/lib/packs";
import { getExpirationAlertSettings } from "@/lib/settings";
import { saveExpirationAlertsAction } from "../_actions/workspaceSettings";
import { AdminPageIntro, AdminSection, AdminTabs } from "../_components/AdminPagePrimitives";

export const runtime = "nodejs";

const DEFAULT_EXPIRATION_ALERT_SETTINGS = {
  enabled: true,
  days: 3,
  emailEnabled: true,
};

const TABS = [
  { key: "general", label: "General", href: "/admin/settings?tab=general" },
  { key: "sharing", label: "Sharing Defaults", href: "/admin/settings?tab=sharing" },
  { key: "notifications", label: "Notifications", href: "/admin/settings?tab=notifications" },
];

export default async function WorkspaceSettingsPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole("owner");
  const params = (await props.searchParams) || {};
  const tabRaw = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const currentTab = TABS.some((tab) => tab.key === tabRaw) ? String(tabRaw) : "general";

  const [plan, billingSnapshot, expirationAlerts] = await Promise.all([
    getPlanForUser(user.id),
    getBillingSnapshotForUser(user.id),
    getExpirationAlertSettings(),
  ]);
  const entitlement = classifyBillingEntitlement(billingSnapshot.subscription);
  const expirationAlertSettings = expirationAlerts.ok
    ? expirationAlerts.settings
    : DEFAULT_EXPIRATION_ALERT_SETTINGS;

  return (
    <div className="space-y-6">
      <AdminPageIntro
        eyebrow="Workspace Settings"
        title="Set the defaults that shape how your workspace operates."
        description="Keep sharing consistent across operators, make notification behavior explicit, and avoid forcing admins to rediscover the right defaults on every send."
      />

      <AdminTabs tabs={TABS} current={currentTab} />

      {currentTab === "general" ? (
        <div className="space-y-6">
          <AdminSection
            title="Workspace identity"
            description="These values define who is operating and what plan posture the workspace currently carries."
            actions={
              <Link href="/admin/branding" className="btn-base btn-secondary rounded-sm px-3 py-2 text-sm">
                Open Branding
              </Link>
            }
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="selection-tile p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Operator</div>
                <div className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{user.email}</div>
              </div>
              <div className="selection-tile p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Workspace Role</div>
                <div className="mt-2 text-lg font-semibold capitalize text-[var(--text-primary)]">{user.role}</div>
              </div>
              <div className="selection-tile p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Plan</div>
                <div className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{plan.name}</div>
              </div>
              <div className="selection-tile p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Entitlement</div>
                <div className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{entitlement}</div>
              </div>
            </div>
          </AdminSection>
        </div>
      ) : null}

      {currentTab === "sharing" ? (
        <div className="space-y-6">
          <AdminSection
            title="Recommended protection modes"
            description="These are the workspace’s supported sharing packs. Free packs keep the default flow simple; Pro packs add stricter access and tighter viewing controls."
            actions={
              <Link href="/admin/documents?createLink=1" className="btn-base btn-secondary rounded-sm px-3 py-2 text-sm">
                Create Link
              </Link>
            }
          >
            <div className="grid gap-3 lg:grid-cols-2">
              {PACKS.map((pack) => (
                <div key={pack.id} className="selection-tile p-4">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-[var(--text-primary)]">{pack.label}</div>
                    <span
                      className={[
                        "inline-flex rounded-full border px-2 py-0.5 text-[11px]",
                        pack.minPlan === "pro"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-[var(--border-subtle)] bg-white text-[var(--text-secondary)]",
                      ].join(" ")}
                    >
                      {pack.minPlan === "pro" ? "Pro" : "Free"}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-[var(--text-secondary)]">{pack.description}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {pack.recommendedFor?.map((label) => (
                      <span key={label} className="rounded-full border border-[var(--border-subtle)] bg-white px-2.5 py-1 text-[11px] text-[var(--text-secondary)]">
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </AdminSection>
        </div>
      ) : null}

      {currentTab === "notifications" ? (
        <div className="space-y-6">
          <AdminSection
            title="Expiration alerts"
            description="Control when operators are warned that active links are about to expire."
          >
            <form action={saveExpirationAlertsAction} className="grid gap-4 lg:grid-cols-[1fr_1fr_240px]">
              <label className="selection-tile p-4 text-sm text-[var(--text-secondary)]">
                <span className="flex items-center justify-between gap-3">
                  <span>Enable in-app expiration alerts</span>
                  <input type="checkbox" name="enabled" value="1" defaultChecked={expirationAlertSettings.enabled} />
                </span>
                <span className="mt-2 block text-xs text-[var(--text-faint)]">Shows expiring-link pressure inside the admin surfaces.</span>
              </label>
              <label className="selection-tile p-4 text-sm text-[var(--text-secondary)]">
                <span className="flex items-center justify-between gap-3">
                  <span>Send email alerts</span>
                  <input
                    type="checkbox"
                    name="emailEnabled"
                    value="1"
                    defaultChecked={expirationAlertSettings.emailEnabled}
                  />
                </span>
                <span className="mt-2 block text-xs text-[var(--text-faint)]">Adds outbound warning email when the threshold is reached.</span>
              </label>
              <label className="selection-tile p-4 text-sm text-[var(--text-secondary)]">
                Alert threshold
                <input
                  type="number"
                  min={1}
                  max={30}
                  name="days"
                  defaultValue={expirationAlertSettings.days}
                  className="field-input mt-2 w-full rounded-sm px-3 py-2 text-sm"
                />
                <span className="mt-2 block text-xs text-[var(--text-faint)]">Warn when links are within this many days of expiry.</span>
              </label>
              <div className="lg:col-span-3">
                <button type="submit" className="btn-base btn-secondary rounded-sm px-4 py-2.5 text-sm">
                  Save Notification Defaults
                </button>
              </div>
            </form>
          </AdminSection>
        </div>
      ) : null}
    </div>
  );
}
