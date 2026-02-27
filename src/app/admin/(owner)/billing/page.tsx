import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";

import { getAuthedUser } from "@/lib/authz";
import { getBillingFlags } from "@/lib/settings";
import { getPlanForUser, getStorageBytesForOwner } from "@/lib/monetization";
import { getActiveViewLimitOverride } from "@/lib/viewLimitOverride";
import { classifyBillingEntitlement, getBillingSnapshotForUser } from "@/lib/billingSubscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">{children}</div>;
}

function ToggleRow({
  name,
  title,
  description,
  defaultChecked,
}: {
  name: string;
  title: string;
  description: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-lg border border-neutral-800 bg-black/30 p-3">
      <div>
        <div className="text-sm font-medium text-white">{title}</div>
        <div className="mt-1 text-xs text-neutral-400">{description}</div>
      </div>
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-950"
      />
    </label>
  );
}

export default async function BillingSettingsPage({
  searchParams,
}: {
  searchParams?: { saved?: string; error?: string; checkout?: string };
}) {
  noStore();

  const u = await getAuthedUser();
  if (!u) redirect("/api/auth/signin");
  if (u.role !== "owner") redirect("/admin/dashboard");

  const res = await getBillingFlags();
  const flags = res.flags;
  const plan = await getPlanForUser(u.id);
  const usedStorage = await getStorageBytesForOwner(u.id);
  const activeViewOverride = await getActiveViewLimitOverride(u.id);
  const billingSnapshot = await getBillingSnapshotForUser(u.id);
  const entitlement = classifyBillingEntitlement(billingSnapshot.subscription);
  const storagePct =
    plan.maxStorageBytes && plan.maxStorageBytes > 0
      ? Math.min(100, Math.max(0, Math.round((usedStorage / plan.maxStorageBytes) * 100)))
      : null;
  const storageWarn = storagePct != null && storagePct >= 80;

  const saved = searchParams?.saved === "1";
  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : null;

  return (
    <div className="mx-auto max-w-3xl p-6 text-white">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Billing & Monetization</h1>
        <p className="mt-2 text-sm text-neutral-300">
          Owner-only runtime flags backed by <span className="font-mono text-xs">public.app_settings</span>.
          These toggle enforcement and UI visibility without a redeploy.
        </p>
      </div>

      {(saved || error) && (
        <div
          className={[
            "mb-4 rounded-lg border p-3 text-sm",
            error ? "border-red-900/60 bg-red-950/40 text-red-200" : "border-emerald-900/60 bg-emerald-950/30 text-emerald-200",
          ].join(" ")}
        >
          {error ? `Failed to save: ${error}` : "Saved."}
        </div>
      )}

      {(searchParams?.checkout === "success" || searchParams?.checkout === "canceled") && (
        <div
          className={[
            "mb-4 rounded-lg border p-3 text-sm",
            searchParams?.checkout === "success"
              ? "border-emerald-900/60 bg-emerald-950/30 text-emerald-200"
              : "border-amber-900/60 bg-amber-950/30 text-amber-200",
          ].join(" ")}
        >
          {searchParams?.checkout === "success"
            ? "Checkout completed. Subscription status will update shortly."
            : "Checkout was canceled."}
        </div>
      )}

      <Card>
        <div className="text-sm font-medium text-white">Current subscription state</div>
        <div className="mt-2 text-xs text-neutral-400">
          Effective plan: <span className="font-semibold text-white">{plan.name}</span>
        </div>
        {plan.id === "free" ? (
          <div className="mt-1 text-xs text-amber-300">
            Free tier uses fixed share expiration windows and does not allow custom expiration.
          </div>
        ) : null}
        <div className="mt-2 text-xs text-neutral-400">
          Entitlement state: <span className="font-semibold text-white">{entitlement}</span>
        </div>
        {billingSnapshot.subscription ? (
          <div className="mt-3 rounded-lg border border-neutral-800 bg-black/30 p-3 text-xs text-neutral-200">
            <div>Status: <span className="font-semibold">{billingSnapshot.subscription.status}</span></div>
            <div>Plan ID: <span className="font-mono">{billingSnapshot.subscription.planId}</span></div>
            <div>
              Current period end:{" "}
              {billingSnapshot.subscription.currentPeriodEnd
                ? new Date(billingSnapshot.subscription.currentPeriodEnd).toLocaleString()
                : "—"}
            </div>
            <div>
              Grace until:{" "}
              {billingSnapshot.subscription.graceUntil
                ? new Date(billingSnapshot.subscription.graceUntil).toLocaleString()
                : "—"}
            </div>
            <div>
              Cancel at period end: {billingSnapshot.subscription.cancelAtPeriodEnd ? "Yes" : "No"}
            </div>
            <div className="text-neutral-400">
              Subscription: {billingSnapshot.subscription.stripeSubscriptionId}
            </div>
            <div className="text-neutral-400">
              Customer: {billingSnapshot.subscription.stripeCustomerId || "—"}
            </div>
          </div>
        ) : (
          <div className="mt-2 text-xs text-neutral-400">
            No Stripe subscription record yet.
          </div>
        )}
      </Card>

      <Card>
        <div className="text-sm font-medium text-white">Stripe billing</div>
        <div className="mt-1 text-xs text-neutral-400">
          Use checkout to start Pro, and customer portal to manage payment method/cancellation.
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/admin/billing/stripe"
            className="inline-flex items-center rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90 hover:bg-white/10"
          >
            Open Stripe Billing Page
          </Link>
          <form action="/api/admin/billing/checkout" method="post">
            <button
              type="submit"
              className="inline-flex items-center rounded-md border border-sky-500/40 bg-sky-500/20 px-3 py-2 text-sm text-sky-100 hover:bg-sky-500/30"
            >
              Upgrade via Stripe Checkout
            </button>
          </form>
          <form action="/api/admin/billing/portal" method="post">
            <button
              type="submit"
              className="inline-flex items-center rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90 hover:bg-white/10"
            >
              Open Stripe Customer Portal
            </button>
          </form>
        </div>
      </Card>

      <Card>
        <div className="text-sm font-medium text-white">Recent Stripe webhook events</div>
        {billingSnapshot.events.length ? (
          <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-800">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-black/40 text-neutral-400">
                <tr>
                  <th className="px-3 py-2">Received</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Message</th>
                </tr>
              </thead>
              <tbody>
                {billingSnapshot.events.map((e) => (
                  <tr key={e.eventId} className="border-t border-neutral-800">
                    <td className="px-3 py-2 whitespace-nowrap text-neutral-300">{new Date(e.receivedAt).toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono text-neutral-200">{e.eventType}</td>
                    <td className="px-3 py-2 text-neutral-200">{e.status}</td>
                    <td className="px-3 py-2 text-neutral-400">{e.message || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-2 text-xs text-neutral-400">No webhook events recorded yet.</div>
        )}
      </Card>

      <Card>
        <div className="text-sm font-medium text-white">Storage usage</div>
        <div className="mt-1 text-xs text-neutral-400">
          Plan cap: {plan.maxStorageBytes == null ? "Unlimited" : `${(plan.maxStorageBytes / (1024 * 1024)).toFixed(0)} MB`}
        </div>
        <div className="mt-2 text-sm text-neutral-200">
          Used: {(usedStorage / (1024 * 1024)).toFixed(1)} MB
          {storagePct != null ? ` (${storagePct}%)` : ""}
        </div>
        {storageWarn ? (
          <div className="mt-3 rounded-lg border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
            Warning: storage usage is at {storagePct}% of your plan limit.
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="text-sm font-medium text-white">View limit override</div>
        <div className="mt-1 text-xs text-neutral-400">
          Temporarily bypass monthly view cap for this owner account.
        </div>
        <div className="mt-2 text-sm text-neutral-200">
          Status:{" "}
          {activeViewOverride ? (
            <span className="text-amber-200">
              Active until {new Date(activeViewOverride.expiresAt).toLocaleString()}
            </span>
          ) : (
            <span className="text-neutral-400">Inactive</span>
          )}
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <form action="/api/admin/billing/view-override" method="post" className="space-y-2 rounded-lg border border-neutral-800 bg-black/30 p-3">
            <input type="hidden" name="action" value="set" />
            <input type="hidden" name="ownerId" value={u.id} />
            <label className="block text-xs text-neutral-400">Hours</label>
            <input
              type="number"
              name="hours"
              min={1}
              max={720}
              defaultValue={24}
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-2 text-sm text-white"
            />
            <label className="block text-xs text-neutral-400">Reason (required in ops)</label>
            <input
              type="text"
              name="reason"
              placeholder="Incident response / temporary support"
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-2 text-sm text-white"
            />
            <button
              type="submit"
              className="inline-flex items-center rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90 hover:bg-white/10"
            >
              Enable override
            </button>
          </form>

          <form action="/api/admin/billing/view-override" method="post" className="space-y-2 rounded-lg border border-neutral-800 bg-black/30 p-3">
            <input type="hidden" name="action" value="clear" />
            <input type="hidden" name="ownerId" value={u.id} />
            <label className="block text-xs text-neutral-400">Reason</label>
            <input
              type="text"
              name="reason"
              placeholder="Override no longer needed"
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-2 text-sm text-white"
            />
            <button
              type="submit"
              className="inline-flex items-center rounded-md border border-red-700/40 bg-red-950/30 px-3 py-2 text-sm text-red-200 hover:bg-red-950/40"
            >
              Disable override
            </button>
          </form>
        </div>
      </Card>

      <Card>
        <form action="/api/admin/billing" method="post" className="space-y-3">
          <ToggleRow
            name="enforcePlanLimits"
            title="Enforce plan limits"
            description="Hard-enforce Free plan storage (500MB), monthly views (100), and active shares (3). Turn OFF only for testing." 
            defaultChecked={flags.enforcePlanLimits}
          />

          <ToggleRow
            name="proPlanEnabled"
            title="Enable Pro unlimited"
            description="When OFF, users with plan_id='pro' are treated as Free for limits. Flip ON only when you’re ready to sell/enable Pro." 
            defaultChecked={flags.proPlanEnabled}
          />

          <ToggleRow
            name="pricingUiEnabled"
            title="Show pricing / upgrade UI"
            description="Controls whether the product surfaces upgrade prompts and pricing-related UI copy. Keep OFF while pricing is hidden." 
            defaultChecked={flags.pricingUiEnabled}
          />

          <div className="pt-2">
            <button
              type="submit"
              className="inline-flex items-center rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90 hover:bg-white/10"
            >
              Save settings
            </button>
          </div>

          {!res.ok && (
            <div className="pt-2 text-xs text-neutral-400">
              Note: DB read failed (using env/defaults). Error: <span className="font-mono">{res.error}</span>
            </div>
          )}
        </form>
      </Card>

      <div className="mt-4 text-xs text-neutral-500">
        Tip: If you ever lock yourself out of this page, you can still override behavior using env vars:
        <span className="ml-1 font-mono">ENFORCE_PLAN_LIMITS</span>, <span className="font-mono">PRO_PLAN_ENABLED</span>, <span className="font-mono">PRICING_UI_ENABLED</span>.
      </div>
    </div>
  );
}
