import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { sql } from "@/lib/db";
import { ensureStripeCustomer, stripeApi } from "@/lib/stripeClient";
import { classifyBillingEntitlement, getBillingSnapshotForUser } from "@/lib/billingSubscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function statusClass(status: string): string {
  const s = String(status || "").toLowerCase();
  if (s === "active") return "border-emerald-500/40 bg-emerald-500/20 text-emerald-100";
  if (s === "grace") return "border-amber-500/40 bg-amber-500/20 text-amber-100";
  if (s === "downgraded" || s === "at_risk") return "border-red-500/40 bg-red-500/20 text-red-100";
  return "border-white/20 bg-white/10 text-white/80";
}

function entitlementGuidance(entitlement: string): { title: string; body: string; tone: string } {
  const e = String(entitlement || "").toLowerCase();
  if (e === "active") {
    return {
      title: "Subscription healthy",
      body: "Billing is active. Plan limits should enforce as Pro entitlement.",
      tone: "border-emerald-900/60 bg-emerald-950/30 text-emerald-200",
    };
  }
  if (e === "grace") {
    return {
      title: "In grace period",
      body: "Payment failed recently. Update payment method in Stripe Portal before grace expires to avoid downgrade.",
      tone: "border-amber-900/60 bg-amber-950/30 text-amber-200",
    };
  }
  if (e === "at_risk") {
    return {
      title: "At risk of downgrade",
      body: "Subscription is incomplete/unpaid. Resolve checkout or billing failure immediately.",
      tone: "border-red-900/60 bg-red-950/30 text-red-200",
    };
  }
  if (e === "downgraded") {
    return {
      title: "Downgraded",
      body: "Entitlement is no longer active. Account limits now follow Free-tier enforcement.",
      tone: "border-red-900/60 bg-red-950/30 text-red-200",
    };
  }
  return {
    title: "No active subscription",
    body: "Start checkout to provision Stripe subscription and unlock paid entitlement.",
    tone: "border-white/20 bg-white/5 text-white/80",
  };
}

async function readExistingCustomerId(userId: string): Promise<string | null> {
  try {
    const rows = (await sql`
      select stripe_customer_id::text as stripe_customer_id
      from public.users
      where id = ${userId}::uuid
      limit 1
    `) as unknown as Array<{ stripe_customer_id: string | null }>;
    return rows?.[0]?.stripe_customer_id ?? null;
  } catch {
    return null;
  }
}

async function persistCustomerId(userId: string, customerId: string): Promise<void> {
  try {
    await sql`
      update public.users
      set stripe_customer_id = ${customerId}
      where id = ${userId}::uuid
    `;
  } catch {
    // optional column in older schemas
  }
}

function fmtMoney(amountCents: number, currency: string): string {
  const n = Number.isFinite(amountCents) ? amountCents : 0;
  const c = (currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: c }).format(n / 100);
  } catch {
    return `${(n / 100).toFixed(2)} ${c}`;
  }
}

export default async function StripeBillingPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await props.searchParams) || {};
  const sync = Array.isArray(sp.sync) ? sp.sync[0] : sp.sync;
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;

  const u = await requirePermission("billing.manage");
  const existingCustomerId = await readExistingCustomerId(u.id);
  const customerId = await ensureStripeCustomer({
    userId: u.id,
    email: u.email,
    existingCustomerId,
  });
  if (customerId !== existingCustomerId) {
    await persistCustomerId(u.id, customerId);
  }

  let invoices: any[] = [];
  let invoicesError: string | null = null;
  try {
    const data = await stripeApi(`invoices?customer=${encodeURIComponent(customerId)}&limit=25`, {
      method: "GET",
    });
    invoices = Array.isArray(data?.data) ? data.data : [];
  } catch (e: any) {
    invoicesError = String(e?.message || e || "Failed to load invoices");
  }

  const snapshot = await getBillingSnapshotForUser(u.id);
  const entitlement = classifyBillingEntitlement(snapshot.subscription);
  const guidance = entitlementGuidance(entitlement);

  return (
    <div className="mx-auto max-w-5xl p-6 text-white">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Stripe Billing</h1>
          <p className="mt-1 text-sm text-neutral-400">Subscription state, invoice history, and Stripe-managed actions.</p>
        </div>
        <Link href="/admin/billing" className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
          Back to Billing Settings
        </Link>
      </div>

      {sync === "ok" ? (
        <div className="mt-3 rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          Billing sync completed.
        </div>
      ) : null}
      {error ? (
        <div className="mt-3 rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-200">
          {decodeURIComponent(String(error))}
        </div>
      ) : null}
      <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${guidance.tone}`}>
        <div className="font-medium">{guidance.title}</div>
        <div className="mt-1 text-xs opacity-90">{guidance.body}</div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="text-sm font-medium">Customer</div>
          <div className="mt-2 text-xs text-neutral-400">Stripe customer id</div>
          <div className="mt-1 font-mono text-sm text-neutral-200">{customerId}</div>
          <div className="mt-3 flex gap-2">
            <form action="/api/admin/billing/checkout" method="post">
              <button type="submit" className="rounded-md border border-sky-500/40 bg-sky-500/20 px-3 py-2 text-sm text-sky-100 hover:bg-sky-500/30">
                Start Checkout
              </button>
            </form>
            <form action="/api/admin/billing/portal" method="post">
              <button type="submit" className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
                Open Portal
              </button>
            </form>
            <form action="/api/admin/billing/sync" method="post">
              <button type="submit" className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
                Run Sync Now
              </button>
            </form>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="text-sm font-medium">Subscription</div>
          <div className="mt-2">
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${statusClass(entitlement)}`}>
              {entitlement}
            </span>
          </div>
          {snapshot.subscription ? (
            <div className="mt-2 space-y-1 text-sm text-neutral-200">
              <div>Status: <span className="font-semibold">{snapshot.subscription.status}</span></div>
              <div>Plan: <span className="font-mono">{snapshot.subscription.planId}</span></div>
              <div>
                Current period end:{" "}
                {snapshot.subscription.currentPeriodEnd
                  ? new Date(snapshot.subscription.currentPeriodEnd).toLocaleString()
                  : "—"}
              </div>
              <div>
                Grace until:{" "}
                {snapshot.subscription.graceUntil
                  ? new Date(snapshot.subscription.graceUntil).toLocaleString()
                  : "—"}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-sm text-neutral-400">No subscription record yet.</div>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="text-sm font-medium">Invoices</div>
        {invoicesError ? (
          <div className="mt-2 rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
            {invoicesError}
          </div>
        ) : invoices.length ? (
          <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-800">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-black/40 text-neutral-400">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Invoice</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Due</th>
                  <th className="px-3 py-2">Paid</th>
                  <th className="px-3 py-2">Links</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, idx) => (
                  <tr key={String(inv?.id || `${inv?.number || "row"}-${idx}`)} className="border-t border-neutral-800">
                    <td className="px-3 py-2 text-neutral-300">
                      {inv?.created ? new Date(Number(inv.created) * 1000).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-neutral-200">{String(inv?.number || inv?.id || "—")}</td>
                    <td className="px-3 py-2 text-neutral-200">{String(inv?.status || "—")}</td>
                    <td className="px-3 py-2 text-neutral-200">{fmtMoney(Number(inv?.amount_due || 0), String(inv?.currency || "USD"))}</td>
                    <td className="px-3 py-2 text-neutral-200">{fmtMoney(Number(inv?.amount_paid || 0), String(inv?.currency || "USD"))}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        {inv?.hosted_invoice_url ? (
                          <a className="text-sky-300 hover:underline" href={String(inv.hosted_invoice_url)} target="_blank" rel="noreferrer">
                            Hosted
                          </a>
                        ) : null}
                        {inv?.invoice_pdf ? (
                          <a className="text-sky-300 hover:underline" href={String(inv.invoice_pdf)} target="_blank" rel="noreferrer">
                            PDF
                          </a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-2 text-sm text-neutral-400">No invoices found yet.</div>
        )}
      </div>
    </div>
  );
}
