import { redirect } from "next/navigation";
import Link from "next/link";
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
    <div className="mx-auto max-w-5xl space-y-5 text-white">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Upgrade to Pro</h1>
        <p className="mt-2 text-sm text-white/70">
          Pro is built for teams that need higher delivery capacity, stronger access control, and expanded visibility into how documents move.
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

      <section className="glass-card-strong rounded-2xl p-5">
        <div className="text-sm text-white/75">
          Current plan: <span className="font-semibold text-white">{plan.name}</span> - Entitlement:{" "}
          <span className="font-semibold text-white">{entitlement}</span>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="glass-card rounded-2xl p-6">
          <h2 className="text-xl font-semibold tracking-tight">Free - $0</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-white/75">
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
          <div className="mt-5">
            <Link
              href="/signin"
              className="btn-base inline-flex rounded-lg border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20"
            >
              Start Free
            </Link>
          </div>
        </article>

        <article className="glass-card-strong rounded-2xl border border-amber-300/35 p-6 shadow-[0_16px_50px_rgba(222,176,82,0.16)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/55 bg-amber-300/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
            Pro
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-tight text-white">Pro - $12/month</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-white/85">
            <li>5 GB total storage</li>
            <li>100 MB max per file</li>
            <li>Unlimited shares</li>
            <li>Unlimited views (soft monitored)</li>
            <li>Custom expiration</li>
            <li>Audit export</li>
            <li>API + webhooks</li>
            <li>Standard abuse throttling</li>
            <li>Advanced controls</li>
          </ul>
          <form action="/api/billing/checkout" method="post" className="mt-5">
            <button
              type="submit"
              className="btn-base rounded-lg border border-amber-200/70 bg-gradient-to-r from-amber-300 to-amber-200 px-4 py-2.5 text-sm font-semibold text-black shadow-[0_8px_24px_rgba(232,194,122,0.32)] hover:brightness-105"
            >
              Upgrade to Pro
            </button>
          </form>
        </article>
      </section>
    </div>
  );
}
