import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { getBillingFlags } from "@/lib/settings";
import { getPlanForUser } from "@/lib/monetization";
import { getBillingSnapshotForUser, classifyBillingEntitlement } from "@/lib/billingSubscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ViewerUpgradePage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const u = await requireUser();
  const flagsRes = await getBillingFlags();
  if (!flagsRes.flags.pricingUiEnabled) {
    redirect("/admin/dashboard");
  }

  const plan = await getPlanForUser(u.id);
  const snapshot = await getBillingSnapshotForUser(u.id);
  const entitlement = classifyBillingEntitlement(snapshot.subscription);
  const params = (await props.searchParams) || {};
  const checkout = Array.isArray(params.checkout) ? params.checkout[0] : params.checkout;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;

  return (
    <div className="mx-auto max-w-4xl space-y-4 text-white">
      <div>
        <h1 className="text-2xl font-semibold">Upgrade to Pro</h1>
        <p className="mt-1 text-sm text-white/70">
          Unlock higher limits and billing-backed entitlement with Stripe checkout.
        </p>
      </div>

      {checkout === "success" ? (
        <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          Checkout completed. Subscription status will update shortly.
        </div>
      ) : null}
      {checkout === "canceled" ? (
        <div className="rounded-lg border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
          Checkout was canceled.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-200">
          {decodeURIComponent(String(error))}
        </div>
      ) : null}

      <section className="glass-card-strong rounded-2xl p-4">
        <div className="text-sm text-white/70">
          Current plan: <span className="font-semibold text-white">{plan.name}</span> - Entitlement:{" "}
          <span className="font-semibold text-white">{entitlement}</span>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="glass-card rounded-2xl p-4">
          <h2 className="text-lg font-semibold">Free - $0</h2>
          <ul className="mt-3 space-y-2 text-sm text-white/75">
            <li>100 MB storage</li>
            <li>25 MB max per file</li>
            <li>3 active shares</li>
            <li>100 views/month</li>
            <li>Share expiration required (7 days max)</li>
            <li>No custom expiration rules</li>
            <li>No permanent shares</li>
            <li>Encryption required</li>
            <li>Virus scan required</li>
            <li>Strict abuse throttling</li>
            <li>No audit export</li>
            <li>Basic analytics only (view count)</li>
          </ul>
        </article>

        <article className="glass-card-strong rounded-2xl border border-cyan-400/30 p-4">
          <h2 className="text-lg font-semibold">Pro</h2>
          <ul className="mt-3 space-y-2 text-sm text-white/85">
            <li>5 GB total storage</li>
            <li>100 MB max per file</li>
            <li>Unlimited shares</li>
            <li>Unlimited views (soft monitored)</li>
            <li>Custom expiration</li>
            <li>Audit export</li>
            <li>API + webhooks</li>
            <li>Standard abuse throttling</li>
            <li>Stripe Customer Portal access</li>
            <li>Grace-state protection on payment failures</li>
          </ul>
          <form action="/api/billing/checkout" method="post" className="mt-4">
            <button
              type="submit"
              className="btn-base rounded-lg border border-cyan-400/45 bg-cyan-400/20 px-4 py-2 text-sm font-medium text-cyan-50 hover:bg-cyan-400/30"
            >
              Start Stripe Checkout
            </button>
          </form>
        </article>
      </section>
    </div>
  );
}
