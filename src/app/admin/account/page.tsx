import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { getBillingFlags } from "@/lib/settings";
import { getPlanForUser } from "@/lib/monetization";
import { classifyBillingEntitlement, getBillingSnapshotForUser } from "@/lib/billingSubscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmtBytes(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "Unlimited";
  const mb = n / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(0)} GB`;
  return `${Math.max(1, Math.floor(mb))} MB`;
}

export default async function AccountPage() {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/api/auth/signin");
  }

  const [plan, billingFlags, billingSnapshot] = await Promise.all([
    getPlanForUser(user.id),
    getBillingFlags(),
    getBillingSnapshotForUser(user.id),
  ]);

  const entitlement = classifyBillingEntitlement(billingSnapshot.subscription);
  const isPro = String(plan.id).toLowerCase() === "pro";
  const pricingEnabled = billingFlags.flags.pricingUiEnabled;

  return (
    <div className="space-y-6">
      <section className="glass-card-strong ui-sheen rounded-[32px] p-6 sm:p-7">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_minmax(0,0.85fr)]">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-cyan-200/70">Account</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Your account, plan, and sharing defaults.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/68 sm:text-base">
              Keep track of your current plan, the protections built into every share, and what changes when you need more capacity.
            </p>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-white/45">Signed in</div>
            <div className="mt-3 text-xl font-semibold text-white">{user.email}</div>
            <div className="mt-2 text-sm text-white/60">
              {isPro ? "Pro plan active" : "Free plan active"}{entitlement ? ` · ${entitlement}` : ""}
            </div>
            {pricingEnabled ? (
              <div className="mt-4">
                <Link href="/admin/upgrade" className="btn-base btn-secondary rounded-xl px-4 py-2 text-sm">
                  {isPro ? "Review plan" : "See upgrade options"}
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="glass-card-strong rounded-[28px] p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-white/45">Current plan</div>
          <div className="mt-3 text-2xl font-semibold text-white">{plan.name}</div>
          <div className="mt-2 text-sm text-white/65">
            {isPro ? "Built for higher-volume secure sharing and stricter control." : "A simple secure-sharing plan for getting started."}
          </div>
        </div>
        <div className="glass-card-strong rounded-[28px] p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-white/45">Upload size</div>
          <div className="mt-3 text-2xl font-semibold text-white">{fmtBytes(plan.maxFileSizeBytes)}</div>
          <div className="mt-2 text-sm text-white/65">Maximum size per file on your current plan.</div>
        </div>
        <div className="glass-card-strong rounded-[28px] p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-white/45">Active protected links</div>
          <div className="mt-3 text-2xl font-semibold text-white">
            {plan.maxActiveShares == null ? "Unlimited" : plan.maxActiveShares}
          </div>
          <div className="mt-2 text-sm text-white/65">How many active links you can keep live at once.</div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_minmax(0,0.9fr)]">
        <div className="glass-card-strong rounded-[28px] p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-white/45">Protection built in</div>
          <h2 className="mt-3 text-xl font-semibold text-white">Every file follows the same calm, security-first flow</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="text-sm font-medium text-white">Encrypted at rest</div>
              <div className="mt-1 text-sm text-white/60">Uploaded files are encrypted before delivery.</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="text-sm font-medium text-white">Scan before sharing</div>
              <div className="mt-1 text-sm text-white/60">Links stay unavailable until the safety check completes.</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="text-sm font-medium text-white">Protected delivery</div>
              <div className="mt-1 text-sm text-white/60">Expiry, passwords, and view controls stay attached to the link.</div>
            </div>
          </div>
        </div>

        <div className="glass-card-strong rounded-[28px] p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-white/45">What changes with Pro</div>
          <div className="mt-3 space-y-3 text-sm text-white/68">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="font-medium text-white">Higher limits</div>
              <div className="mt-1">Bigger file sizes, more storage, and more room to keep links active.</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="font-medium text-white">More control</div>
              <div className="mt-1">Unlock stricter presets, one-time access, and richer sharing options.</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="font-medium text-white">More visibility</div>
              <div className="mt-1">Track engagement with deeper insight into what people opened and when.</div>
            </div>
          </div>
          {pricingEnabled ? (
            <div className="mt-4">
              <Link href="/admin/upgrade" className="btn-base rounded-xl border border-cyan-300/40 bg-cyan-300 px-4 py-2 text-sm font-semibold text-[#07131f] hover:bg-cyan-200">
                {isPro ? "Manage plan" : "Upgrade to Pro"}
              </Link>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
