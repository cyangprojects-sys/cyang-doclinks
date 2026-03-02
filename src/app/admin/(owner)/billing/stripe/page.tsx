import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { sql } from "@/lib/db";
import { ensureStripeCustomer, stripeApi } from "@/lib/stripeClient";
import {
  billingTablesReady,
  classifyBillingEntitlement,
  getBillingSnapshotForUser,
  getBillingWebhookDebugSummary,
} from "@/lib/billingSubscription";
import { getBillingFlags } from "@/lib/settings";

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

function invoiceStatusClass(status: string): string {
  const s = String(status || "").toLowerCase();
  if (s === "paid") return "border-emerald-500/40 bg-emerald-500/15 text-emerald-100";
  if (s === "open" || s === "draft") return "border-amber-500/40 bg-amber-500/15 text-amber-100";
  if (s === "void" || s === "uncollectible") return "border-red-500/40 bg-red-500/15 text-red-100";
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

  let customerId: string | null = null;
  let stripeConfigError: string | null = null;
  try {
    const existingCustomerId = await readExistingCustomerId(u.id);
    customerId = await ensureStripeCustomer({
      userId: u.id,
      email: u.email,
      existingCustomerId,
    });
    if (customerId !== existingCustomerId) {
      await persistCustomerId(u.id, customerId);
    }
  } catch (e: any) {
    stripeConfigError = String(e?.message || e || "Stripe configuration error");
  }

  let invoices: any[] = [];
  let invoicesError: string | null = null;
  if (customerId) {
    try {
      const data = await stripeApi(`invoices?customer=${encodeURIComponent(customerId)}&limit=25`, {
        method: "GET",
      });
      invoices = Array.isArray(data?.data) ? data.data : [];
    } catch (e: any) {
      invoicesError = String(e?.message || e || "Failed to load invoices");
    }
  }

  const snapshot = await getBillingSnapshotForUser(u.id);
  const entitlement = classifyBillingEntitlement(snapshot.subscription);
  const guidance = entitlementGuidance(entitlement);
  const billingFlags = await getBillingFlags();
  const billingTables = await billingTablesReady();
  const webhookDebug = await getBillingWebhookDebugSummary();
  const stripeEntitlementEnforced = String(process.env.STRIPE_ENFORCE_ENTITLEMENT || "1").trim() !== "0";
  const paidInvoices = invoices.filter((inv) => String(inv?.status || "").toLowerCase() === "paid").length;
  const failedInvoices = invoices.filter((inv) => {
    const s = String(inv?.status || "").toLowerCase();
    return s === "void" || s === "uncollectible";
  }).length;

  return (
    <div className="mx-auto max-w-6xl p-6 text-white">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(120%_140%_at_0%_0%,rgba(14,165,233,0.20),rgba(10,10,10,0.90)_45%,rgba(10,10,10,1)_100%)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center rounded-full border border-sky-400/30 bg-sky-500/15 px-2.5 py-1 text-xs font-medium tracking-wide text-sky-100">
              Stripe Control Center
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Billing</h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-300">
              Track entitlement health, launch checkout and portal sessions, and review invoice outcomes from one screen.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/billing"
              className="rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white/90 transition hover:bg-white/15"
            >
              Billing Settings
            </Link>
            <form action="/api/admin/billing/sync" method="post">
              <button
                type="submit"
                disabled={!customerId}
                className="rounded-md border border-sky-400/40 bg-sky-500/25 px-3 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-500/35 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Run Sync
              </button>
            </form>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-white/15 bg-black/35 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-400">Entitlement</div>
            <div className="mt-2">
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${statusClass(entitlement)}`}>
                {entitlement}
              </span>
            </div>
          </div>
          <div className="rounded-xl border border-white/15 bg-black/35 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-400">Invoices Loaded</div>
            <div className="mt-2 text-2xl font-semibold text-white">{invoices.length}</div>
            <div className="mt-1 text-xs text-neutral-400">Last 25 records from Stripe</div>
          </div>
          <div className="rounded-xl border border-white/15 bg-black/35 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-400">Paid</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-200">{paidInvoices}</div>
            <div className="mt-1 text-xs text-neutral-400">Successful invoices</div>
          </div>
          <div className="rounded-xl border border-white/15 bg-black/35 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-400">Needs Review</div>
            <div className="mt-2 text-2xl font-semibold text-amber-200">{failedInvoices}</div>
            <div className="mt-1 text-xs text-neutral-400">Void or uncollectible</div>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {sync === "ok" ? (
          <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
            Billing sync completed.
          </div>
        ) : null}
        {error ? (
          <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-200">
            {decodeURIComponent(String(error))}
          </div>
        ) : null}
        {stripeConfigError ? (
          <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-200">
            Stripe is not configured for this environment: {stripeConfigError}
          </div>
        ) : null}
        <div className={`rounded-lg border px-3 py-2 text-sm ${guidance.tone}`}>
          <div className="font-medium">{guidance.title}</div>
          <div className="mt-1 text-xs opacity-90">{guidance.body}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 lg:col-span-2">
          <div className="text-sm font-medium text-white">Customer & Actions</div>
          <div className="mt-2 text-xs text-neutral-400">Stripe customer id</div>
          <div className="mt-1 rounded-md border border-neutral-800 bg-black/30 px-2 py-2 font-mono text-xs text-neutral-200">
            {customerId || "-"}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <form action="/api/admin/billing/checkout" method="post">
              <button
                type="submit"
                disabled={!customerId}
                className="w-full rounded-md border border-sky-500/40 bg-sky-500/20 px-3 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Start Checkout
              </button>
            </form>
            <form action="/api/admin/billing/portal" method="post">
              <button
                type="submit"
                disabled={!customerId}
                className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Open Portal
              </button>
            </form>
            <form action="/api/admin/billing/sync" method="post" className="sm:col-span-2">
              <button
                type="submit"
                disabled={!customerId}
                className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Run Sync Now
              </button>
            </form>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 lg:col-span-3">
          <div className="text-sm font-medium text-white">Subscription Snapshot</div>
          {snapshot.subscription ? (
            <div className="mt-3 grid gap-2 text-sm text-neutral-200 sm:grid-cols-2">
              <div className="rounded-lg border border-neutral-800 bg-black/30 p-3">
                <div className="text-xs text-neutral-400">Status</div>
                <div className="mt-1 font-semibold capitalize">{snapshot.subscription.status}</div>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-black/30 p-3">
                <div className="text-xs text-neutral-400">Plan</div>
                <div className="mt-1 font-mono">{snapshot.subscription.planId}</div>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-black/30 p-3">
                <div className="text-xs text-neutral-400">Current period end</div>
                <div className="mt-1">
                  {snapshot.subscription.currentPeriodEnd
                    ? new Date(snapshot.subscription.currentPeriodEnd).toLocaleString()
                    : "-"}
                </div>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-black/30 p-3">
                <div className="text-xs text-neutral-400">Grace until</div>
                <div className="mt-1">
                  {snapshot.subscription.graceUntil
                    ? new Date(snapshot.subscription.graceUntil).toLocaleString()
                    : "-"}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-sm text-neutral-400">No subscription record yet.</div>
          )}
        </div>
      </div>

      <div className="glass-card-strong mt-4 rounded-2xl p-5">
        <div className="text-sm font-medium text-white">Billing debug status</div>
        <div className="mt-3 grid gap-2 text-xs text-neutral-300 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-neutral-800 bg-black/30 p-3">
            <div className="text-neutral-400">Billing tables ready</div>
            <div className="mt-1 font-semibold">{billingTables ? "yes" : "no"}</div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-black/30 p-3">
            <div className="text-neutral-400">Plan limit enforcement</div>
            <div className="mt-1 font-semibold">{billingFlags.flags.enforcePlanLimits ? "enabled" : "disabled"}</div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-black/30 p-3">
            <div className="text-neutral-400">Stripe entitlement enforcement</div>
            <div className="mt-1 font-semibold">{stripeEntitlementEnforced ? "enabled" : "disabled"}</div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-black/30 p-3">
            <div className="text-neutral-400">`billing_webhook_events` table</div>
            <div className="mt-1 font-semibold">{webhookDebug.billingWebhookEventsTable ? "present" : "missing"}</div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-black/30 p-3">
            <div className="text-neutral-400">`stripe_event_log` table</div>
            <div className="mt-1 font-semibold">{webhookDebug.stripeEventLogTable ? "present" : "missing"}</div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-black/30 p-3">
            <div className="text-neutral-400">Last webhook event</div>
            <div className="mt-1 font-semibold">{webhookDebug.lastEventAt ? new Date(webhookDebug.lastEventAt).toLocaleString() : "-"}</div>
          </div>
        </div>
        <div className="mt-3 grid gap-2 text-xs text-neutral-300 sm:grid-cols-3">
          <div className="rounded-lg border border-neutral-800 bg-black/30 p-3">
            <div className="text-neutral-400">Total logged events</div>
            <div className="mt-1 font-semibold">{webhookDebug.totalEvents}</div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-black/30 p-3">
            <div className="text-neutral-400">Duplicate-like events</div>
            <div className="mt-1 font-semibold">{webhookDebug.duplicateLikeEvents}</div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-black/30 p-3">
            <div className="text-neutral-400">Failed events</div>
            <div className="mt-1 font-semibold">{webhookDebug.failedEvents}</div>
          </div>
        </div>
      </div>

      <div className="glass-card-strong mt-4 rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-white">Invoices</div>
            <div className="mt-1 text-xs text-neutral-400">Recent Stripe invoices for this customer.</div>
          </div>
        </div>
        {invoicesError ? (
          <div className="mt-2 rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
            {invoicesError}
          </div>
        ) : invoices.length ? (
          <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
            <div className="max-h-[380px] overflow-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#10192b]/95 text-neutral-400 backdrop-blur">
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
                    <tr key={String(inv?.id || `${inv?.number || "row"}-${idx}`)} className="border-t border-white/10">
                    <td className="px-3 py-2 text-neutral-300">
                      {inv?.created ? new Date(Number(inv.created) * 1000).toLocaleString() : "-"}
                    </td>
                    <td className="px-3 py-2 font-mono text-neutral-200">{String(inv?.number || inv?.id || "-")}</td>
                    <td className="px-3 py-2 text-neutral-200">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${invoiceStatusClass(String(inv?.status || "-"))}`}>
                        {String(inv?.status || "-")}
                      </span>
                    </td>
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
          </div>
        ) : (
          <div className="mt-2 text-sm text-neutral-400">No invoices found yet.</div>
        )}
      </div>
    </div>
  );
}
