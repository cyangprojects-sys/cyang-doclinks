import Link from "next/link";
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
  const user = await requireUser();
  const flagsRes = await getBillingFlags();
  if (!flagsRes.flags.pricingUiEnabled) {
    redirect("/admin/dashboard");
  }

  const [plan, snapshot, rawParams] = await Promise.all([
    getPlanForUser(user.id),
    getBillingSnapshotForUser(user.id),
    props.searchParams || Promise.resolve({} as Record<string, string | string[] | undefined>),
  ]);
  const entitlement = classifyBillingEntitlement(snapshot.subscription);
  const params = rawParams as Record<string, string | string[] | undefined>;
  const checkout = Array.isArray(params.checkout) ? params.checkout[0] : params.checkout;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const isPro = String(plan.id).toLowerCase() === "pro";

  return (
    <div className="space-y-6 text-white">
      <section className="glass-card-strong ui-sheen rounded-[32px] p-6 sm:p-7">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_minmax(0,0.8fr)]">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-cyan-200/70">Upgrade</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Choose the plan that fits how you share.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/68 sm:text-base">
              Stay on Free for lightweight secure sharing, or move to Pro when you need bigger files, more active links, and tighter control over how access works.
            </p>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-white/45">Current plan</div>
            <div className="mt-3 text-2xl font-semibold text-white">{plan.name}</div>
            <div className="mt-2 text-sm text-white/60">
              {isPro ? "Pro is active on your account." : "You are currently using the Free plan."}
              {entitlement ? ` · ${entitlement}` : ""}
            </div>
            <div className="mt-4">
              <Link href="/admin/account" className="btn-base btn-secondary rounded-xl px-4 py-2 text-sm">
                Review account
              </Link>
            </div>
          </div>
        </div>
      </section>

      {checkout === "success" ? (
        <div className="rounded-2xl border border-emerald-900/60 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
          Upgrade complete. Your account will refresh with Pro access shortly.
        </div>
      ) : null}
      {checkout === "canceled" ? (
        <div className="rounded-2xl border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          Checkout was canceled. Your current plan has not changed.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {decodeURIComponent(String(error))}
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="glass-card rounded-[28px] p-6">
          <div className="inline-flex items-center rounded-lg border border-sky-200/70 bg-gradient-to-r from-sky-300 to-cyan-200 px-3 py-1.5 text-sm font-semibold text-black shadow-[0_8px_24px_rgba(73,179,255,0.30)]">
            Free · $0
          </div>
          <h2 className="mt-4 text-2xl font-semibold text-white">Simple secure sharing</h2>
          <p className="mt-2 text-sm text-white/68">
            A good fit when you share occasionally and want strong defaults without needing advanced controls.
          </p>
          <ul className="mt-5 space-y-2.5 text-sm text-white/75">
            <li>Up to 25 MB per file</li>
            <li>Up to 3 active protected links</li>
            <li>Required expiration on links</li>
            <li>Built-in encryption and scan checks</li>
            <li>Basic view tracking</li>
          </ul>
          <div className="mt-6 text-xs text-white/55">
            {isPro ? "You have access to more than this with Pro." : "You are currently on Free."}
          </div>
        </article>

        <article className="glass-card-strong rounded-[28px] border border-amber-300/35 p-6 shadow-[0_16px_50px_rgba(222,176,82,0.16)]">
          <div className="inline-flex items-center rounded-lg border border-amber-200/70 bg-gradient-to-r from-amber-300 to-amber-200 px-3 py-1.5 text-sm font-semibold text-black shadow-[0_8px_24px_rgba(232,194,122,0.32)]">
            Pro · $12/month
          </div>
          <h2 className="mt-4 text-2xl font-semibold text-white">More room, more control, more confidence</h2>
          <p className="mt-2 text-sm text-white/72">
            Pro is designed for people who share often and want a more polished, more controlled secure-sharing experience.
          </p>
          <ul className="mt-5 space-y-2.5 text-sm text-white/85">
            <li>Up to 100 MB per file</li>
            <li>Unlimited active protected links</li>
            <li>Custom expiration and richer presets</li>
            <li>One-time and stricter access modes</li>
            <li>Richer engagement visibility</li>
          </ul>
          <form action="/api/billing/checkout" method="post" className="mt-6">
            <button
              type="submit"
              className="btn-base rounded-xl border border-amber-200/70 bg-gradient-to-r from-amber-300 to-amber-200 px-4 py-2.5 text-sm font-semibold text-black shadow-[0_8px_24px_rgba(232,194,122,0.32)] hover:brightness-105"
            >
              {isPro ? "Switch plan details" : "Upgrade to Pro"}
            </button>
          </form>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="glass-card-strong rounded-[24px] p-5">
          <div className="text-sm font-medium text-white">Bigger sharing workflows</div>
          <div className="mt-2 text-sm text-white/65">Handle larger files and keep more protected links active at the same time.</div>
        </div>
        <div className="glass-card-strong rounded-[24px] p-5">
          <div className="text-sm font-medium text-white">Stricter sharing controls</div>
          <div className="mt-2 text-sm text-white/65">Use stronger presets when you need tighter control over access and reuse.</div>
        </div>
        <div className="glass-card-strong rounded-[24px] p-5">
          <div className="text-sm font-medium text-white">More visibility after sharing</div>
          <div className="mt-2 text-sm text-white/65">Track more of what is being opened so you can follow up with confidence.</div>
        </div>
      </section>
    </div>
  );
}
