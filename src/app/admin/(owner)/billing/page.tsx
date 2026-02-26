import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { getAuthedUser } from "@/lib/authz";
import { getBillingFlags } from "@/lib/settings";
import { getPlanForUser, getStorageBytesForOwner } from "@/lib/monetization";

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
  searchParams?: { saved?: string; error?: string };
}) {
  noStore();

  const u = await getAuthedUser();
  if (!u) redirect("/api/auth/signin");
  if (u.role !== "owner") redirect("/admin/dashboard");

  const res = await getBillingFlags();
  const flags = res.flags;
  const plan = await getPlanForUser(u.id);
  const usedStorage = await getStorageBytesForOwner(u.id);
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
