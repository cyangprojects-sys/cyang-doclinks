import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { classifyBillingEntitlement, getBillingSnapshotForUser } from "@/lib/billingSubscription";
import { getPlanForUser } from "@/lib/monetization";
import { PACKS } from "@/lib/packs";
import { getExpirationAlertSettings } from "@/lib/settings";
import { saveExpirationAlertsAction } from "../_actions/workspaceSettings";
import { AdminPageIntro, AdminSection, AdminTabs } from "../_components/AdminPagePrimitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
              <Link href="/admin/branding" className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
                Open Branding
              </Link>
            }
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-white/45">Operator</div>
                <div className="mt-2 text-lg font-semibold text-white">{user.email}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-white/45">Workspace Role</div>
                <div className="mt-2 text-lg font-semibold capitalize text-white">{user.role}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-white/45">Plan</div>
                <div className="mt-2 text-lg font-semibold text-white">{plan.name}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-white/45">Entitlement</div>
                <div className="mt-2 text-lg font-semibold text-white">{entitlement}</div>
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
              <Link href="/admin/documents?createLink=1" className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
                Create Link
              </Link>
            }
          >
            <div className="grid gap-3 lg:grid-cols-2">
              {PACKS.map((pack) => (
                <div key={pack.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-white">{pack.label}</div>
                    <span
                      className={[
                        "inline-flex rounded-full border px-2 py-0.5 text-[11px]",
                        pack.minPlan === "pro"
                          ? "border-amber-300/28 bg-amber-300/12 text-amber-100"
                          : "border-white/12 bg-white/[0.05] text-white/70",
                      ].join(" ")}
                    >
                      {pack.minPlan === "pro" ? "Pro" : "Free"}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-white/62">{pack.description}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {pack.recommendedFor?.map((label) => (
                      <span key={label} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/68">
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
              <label className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/72">
                <span className="flex items-center justify-between gap-3">
                  <span>Enable in-app expiration alerts</span>
                  <input type="checkbox" name="enabled" value="1" defaultChecked={expirationAlertSettings.enabled} />
                </span>
                <span className="mt-2 block text-xs text-white/48">Shows expiring-link pressure inside the admin surfaces.</span>
              </label>
              <label className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/72">
                <span className="flex items-center justify-between gap-3">
                  <span>Send email alerts</span>
                  <input
                    type="checkbox"
                    name="emailEnabled"
                    value="1"
                    defaultChecked={expirationAlertSettings.emailEnabled}
                  />
                </span>
                <span className="mt-2 block text-xs text-white/48">Adds outbound warning email when the threshold is reached.</span>
              </label>
              <label className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/72">
                Alert threshold
                <input
                  type="number"
                  min={1}
                  max={30}
                  name="days"
                  defaultValue={expirationAlertSettings.days}
                  className="mt-2 w-full rounded-xl border border-white/14 bg-black/20 px-3 py-2 text-sm text-white"
                />
                <span className="mt-2 block text-xs text-white/48">Warn when links are within this many days of expiry.</span>
              </label>
              <div className="lg:col-span-3">
                <button type="submit" className="btn-base rounded-xl border border-white/12 bg-white/[0.06] px-4 py-2.5 text-sm text-white/82 hover:bg-white/[0.1]">
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
