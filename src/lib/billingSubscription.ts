import { sql } from "@/lib/db";

type StripeSubUpsertArgs = {
  userId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string;
  status: string;
  planId: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  graceUntil: string | null;
};

let billingTableExistsCache: boolean | null = null;

async function billingTableExists(): Promise<boolean> {
  if (billingTableExistsCache != null) return billingTableExistsCache;
  try {
    const rows = (await sql`select to_regclass('public.billing_subscriptions')::text as reg`) as unknown as Array<{ reg: string | null }>;
    billingTableExistsCache = Boolean(rows?.[0]?.reg);
  } catch {
    billingTableExistsCache = false;
  }
  return billingTableExistsCache;
}

export async function billingTablesReady(): Promise<boolean> {
  return billingTableExists();
}

export function unixToIso(v: unknown): string | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

export async function getUserIdByStripeCustomerId(customerId: string | null): Promise<string | null> {
  const id = String(customerId || "").trim();
  if (!id) return null;
  try {
    const rows = (await sql`
      select id::text as id
      from public.users
      where stripe_customer_id = ${id}
      limit 1
    `) as unknown as Array<{ id: string }>;
    return rows?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

export async function upsertStripeSubscription(args: StripeSubUpsertArgs): Promise<void> {
  if (!(await billingTableExists())) return;
  if (!args.userId && !args.stripeCustomerId) return;

  await sql`
    insert into public.billing_subscriptions (
      user_id,
      stripe_customer_id,
      stripe_subscription_id,
      status,
      plan_id,
      current_period_end,
      cancel_at_period_end,
      grace_until,
      updated_at
    ) values (
      ${args.userId}::uuid,
      ${args.stripeCustomerId},
      ${args.stripeSubscriptionId},
      ${args.status},
      ${args.planId},
      ${args.currentPeriodEnd ? args.currentPeriodEnd : null}::timestamptz,
      ${args.cancelAtPeriodEnd},
      ${args.graceUntil ? args.graceUntil : null}::timestamptz,
      now()
    )
    on conflict (stripe_subscription_id)
    do update set
      user_id = excluded.user_id,
      stripe_customer_id = excluded.stripe_customer_id,
      status = excluded.status,
      plan_id = excluded.plan_id,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end,
      grace_until = excluded.grace_until,
      updated_at = now()
  `;

  if (args.userId && args.stripeCustomerId) {
    try {
      await sql`
        update public.users
        set stripe_customer_id = ${args.stripeCustomerId}
        where id = ${args.userId}::uuid
      `;
    } catch {
      // optional column in older envs
    }
  }
}

export async function markPaymentFailure(args: {
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  graceDays: number;
}): Promise<void> {
  if (!(await billingTableExists())) return;

  const subId = String(args.stripeSubscriptionId || "").trim();
  const customerId = String(args.stripeCustomerId || "").trim();
  if (!subId && !customerId) return;

  await sql`
    update public.billing_subscriptions
    set
      status = 'past_due',
      grace_until = now() + (${Math.max(0, Math.floor(args.graceDays))}::int * interval '1 day'),
      updated_at = now()
    where
      (${subId} <> '' and stripe_subscription_id = ${subId})
      or (${customerId} <> '' and stripe_customer_id = ${customerId})
  `;
}

export async function markPaymentSucceeded(args: {
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
}): Promise<void> {
  if (!(await billingTableExists())) return;

  const subId = String(args.stripeSubscriptionId || "").trim();
  const customerId = String(args.stripeCustomerId || "").trim();
  if (!subId && !customerId) return;

  await sql`
    update public.billing_subscriptions
    set
      status = 'active',
      grace_until = null,
      updated_at = now()
    where
      (${subId} <> '' and stripe_subscription_id = ${subId})
      or (${customerId} <> '' and stripe_customer_id = ${customerId})
  `;
}

export async function syncUserPlanFromSubscription(userId: string | null): Promise<"free" | "pro" | null> {
  const uid = String(userId || "").trim();
  if (!uid) return null;
  if (!(await billingTableExists())) return null;

  const rows = (await sql`
    select
      plan_id::text as plan_id,
      status::text as status,
      current_period_end::text as current_period_end,
      grace_until::text as grace_until
    from public.billing_subscriptions
    where user_id = ${uid}::uuid
    order by updated_at desc
    limit 1
  `) as unknown as Array<{
    plan_id: string | null;
    status: string | null;
    current_period_end: string | null;
    grace_until: string | null;
  }>;

  const r = rows?.[0];
  const planId = String(r?.plan_id || "free").toLowerCase() === "pro" ? "pro" : "free";
  const status = String(r?.status || "").toLowerCase();
  const now = Date.now();
  const graceUntil = r?.grace_until ? Date.parse(r.grace_until) : Number.NaN;
  const periodEnd = r?.current_period_end ? Date.parse(r.current_period_end) : Number.NaN;

  const entitled =
    status === "active" ||
    status === "trialing" ||
    ((status === "past_due" || status === "grace") && Number.isFinite(graceUntil) && graceUntil > now) ||
    (status === "active" && Number.isFinite(periodEnd) && periodEnd > now);

  const nextPlan: "free" | "pro" = planId === "pro" && entitled ? "pro" : "free";

  await sql`
    update public.users
    set plan_id = ${nextPlan}
    where id = ${uid}::uuid
      and plan_id <> ${nextPlan}
  `;

  return nextPlan;
}

export async function beginWebhookEvent(eventId: string, eventType: string, payload: any): Promise<"new" | "duplicate"> {
  if (!(await billingTableExists())) return "new";
  try {
    const rows = (await sql`
      insert into public.billing_webhook_events (event_id, event_type, payload, status, received_at)
      values (${eventId}, ${eventType}, ${payload as any}::jsonb, 'processing', now())
      on conflict (event_id) do nothing
      returning event_id
    `) as unknown as Array<{ event_id: string }>;
    return rows?.length ? "new" : "duplicate";
  } catch {
    return "new";
  }
}

export async function completeWebhookEvent(eventId: string, status: "processed" | "ignored" | "failed", message: string | null): Promise<void> {
  if (!(await billingTableExists())) return;
  try {
    await sql`
      update public.billing_webhook_events
      set status = ${status}, message = ${message}, processed_at = now()
      where event_id = ${eventId}
    `;
  } catch {
    // ignore
  }
}

export type BillingSubscriptionSnapshot = {
  stripeSubscriptionId: string;
  stripeCustomerId: string | null;
  status: string;
  planId: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  graceUntil: string | null;
  updatedAt: string;
} | null;

export type BillingWebhookEventRow = {
  eventId: string;
  eventType: string;
  status: string;
  message: string | null;
  receivedAt: string;
  processedAt: string | null;
};

export type BillingEntitlementStatus = "none" | "active" | "grace" | "at_risk" | "downgraded";

export function classifyBillingEntitlement(sub: BillingSubscriptionSnapshot): BillingEntitlementStatus {
  if (!sub) return "none";

  const status = String(sub.status || "").toLowerCase();
  const now = Date.now();
  const graceUntil = sub.graceUntil ? Date.parse(sub.graceUntil) : Number.NaN;
  const periodEnd = sub.currentPeriodEnd ? Date.parse(sub.currentPeriodEnd) : Number.NaN;

  if (status === "active" || status === "trialing") return "active";
  if ((status === "past_due" || status === "grace") && Number.isFinite(graceUntil) && graceUntil > now) {
    return "grace";
  }
  if (status === "incomplete" || status === "incomplete_expired" || status === "unpaid") return "at_risk";
  if (status === "canceled" || status === "grace_expired") return "downgraded";
  if (status === "active" && Number.isFinite(periodEnd) && periodEnd <= now) return "at_risk";

  return "at_risk";
}

export async function getBillingSnapshotForUser(userId: string): Promise<{
  subscription: BillingSubscriptionSnapshot;
  events: BillingWebhookEventRow[];
}> {
  if (!(await billingTableExists())) return { subscription: null, events: [] };

  const subRows = (await sql`
    select
      stripe_subscription_id::text as stripe_subscription_id,
      stripe_customer_id::text as stripe_customer_id,
      status::text as status,
      plan_id::text as plan_id,
      current_period_end::text as current_period_end,
      cancel_at_period_end::boolean as cancel_at_period_end,
      grace_until::text as grace_until,
      updated_at::text as updated_at
    from public.billing_subscriptions
    where user_id = ${userId}::uuid
    order by updated_at desc
    limit 1
  `) as unknown as Array<{
    stripe_subscription_id: string;
    stripe_customer_id: string | null;
    status: string;
    plan_id: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    grace_until: string | null;
    updated_at: string;
  }>;

  const sub = subRows?.[0]
    ? {
        stripeSubscriptionId: subRows[0].stripe_subscription_id,
        stripeCustomerId: subRows[0].stripe_customer_id ?? null,
        status: subRows[0].status,
        planId: subRows[0].plan_id,
        currentPeriodEnd: subRows[0].current_period_end ?? null,
        cancelAtPeriodEnd: Boolean(subRows[0].cancel_at_period_end),
        graceUntil: subRows[0].grace_until ?? null,
        updatedAt: subRows[0].updated_at,
      }
    : null;

  const evRows = (await sql`
    select
      event_id::text as event_id,
      event_type::text as event_type,
      status::text as status,
      message::text as message,
      received_at::text as received_at,
      processed_at::text as processed_at
    from public.billing_webhook_events
    order by received_at desc
    limit 20
  `) as unknown as Array<{
    event_id: string;
    event_type: string;
    status: string;
    message: string | null;
    received_at: string;
    processed_at: string | null;
  }>;

  const events: BillingWebhookEventRow[] = evRows.map((r) => ({
    eventId: r.event_id,
    eventType: r.event_type,
    status: r.status,
    message: r.message ?? null,
    receivedAt: r.received_at,
    processedAt: r.processed_at ?? null,
  }));

  return { subscription: sub, events };
}

export async function runBillingMaintenance(args?: { maxUsers?: number }): Promise<{
  ok: boolean;
  usersScanned: number;
  downgradedToFree: number;
  errors: number;
}> {
  if (!(await billingTableExists())) {
    return { ok: false, usersScanned: 0, downgradedToFree: 0, errors: 0 };
  }

  const maxUsers = Math.max(1, Math.min(5000, Number(args?.maxUsers || process.env.BILLING_MAINTENANCE_MAX_USERS || 500)));

  try {
    // Mark expired grace windows to a terminal state so entitlement checks are deterministic.
    await sql`
      update public.billing_subscriptions
      set
        status = 'grace_expired',
        updated_at = now()
      where lower(coalesce(status, '')) in ('past_due', 'grace')
        and grace_until is not null
        and grace_until <= now()
    `;
  } catch {
    // non-fatal
  }

  const userRows = (await sql`
    select distinct user_id::text as user_id
    from public.billing_subscriptions
    where user_id is not null
    order by user_id
    limit ${maxUsers}
  `) as unknown as Array<{ user_id: string }>;

  let usersScanned = 0;
  let downgradedToFree = 0;
  let errors = 0;

  for (const row of userRows) {
    const uid = String(row.user_id || "").trim();
    if (!uid) continue;
    usersScanned += 1;
    try {
      const nextPlan = await syncUserPlanFromSubscription(uid);
      if (nextPlan === "free") downgradedToFree += 1;
    } catch {
      errors += 1;
    }
  }

  return { ok: true, usersScanned, downgradedToFree, errors };
}
