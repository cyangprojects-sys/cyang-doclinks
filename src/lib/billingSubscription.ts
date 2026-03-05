import { sql } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StripeSubUpsertArgs = {
  userId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string;
  status: string;
  planId: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  graceUntil: string | null;
  eventCreatedUnix: number | null;
};

let billingTableExistsCache: boolean | null = null;

function normalizeUuid(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  return UUID_RE.test(normalized) ? normalized : null;
}

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

export async function getUserIdByStripeSubscriptionId(subscriptionId: string | null): Promise<string | null> {
  const id = String(subscriptionId || "").trim();
  if (!id) return null;
  if (!(await billingTableExists())) return null;
  try {
    const rows = (await sql`
      select user_id::text as user_id
      from public.billing_subscriptions
      where stripe_subscription_id = ${id}
      limit 1
    `) as unknown as Array<{ user_id: string | null }>;
    return rows?.[0]?.user_id ?? null;
  } catch {
    return null;
  }
}

export async function resolveUserIdForStripeWebhookEvent(args: {
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  metadataUserId: string | null;
}): Promise<{ ok: true; userId: string | null } | { ok: false; error: string }> {
  const subscriptionId = String(args.stripeSubscriptionId || "").trim() || null;
  const customerId = String(args.stripeCustomerId || "").trim() || null;
  const metadataUserIdRaw = String(args.metadataUserId || "").trim() || null;
  const metadataUserId = normalizeUuid(metadataUserIdRaw);
  if (metadataUserIdRaw && !metadataUserId) {
    return { ok: false, error: "BILLING_BINDING_METADATA_USER_INVALID" };
  }

  const [subscriptionUserId, customerUserId] = await Promise.all([
    getUserIdByStripeSubscriptionId(subscriptionId),
    getUserIdByStripeCustomerId(customerId),
  ]);

  if (subscriptionUserId && customerUserId && subscriptionUserId !== customerUserId) {
    return { ok: false, error: "BILLING_BINDING_CONFLICT_SUBSCRIPTION_CUSTOMER" };
  }
  if (subscriptionUserId && metadataUserId && subscriptionUserId !== metadataUserId) {
    return { ok: false, error: "BILLING_BINDING_CONFLICT_SUBSCRIPTION_METADATA" };
  }
  if (customerUserId && metadataUserId && customerUserId !== metadataUserId) {
    return { ok: false, error: "BILLING_BINDING_CONFLICT_CUSTOMER_METADATA" };
  }

  const pinnedUserId = subscriptionUserId || customerUserId;
  if (pinnedUserId) return { ok: true, userId: pinnedUserId };
  if (!metadataUserId) return { ok: true, userId: null };

  try {
    const rows = (await sql`
      select
        id::text as id,
        stripe_customer_id::text as stripe_customer_id
      from public.users
      where id = ${metadataUserId}::uuid
      limit 1
    `) as unknown as Array<{ id: string; stripe_customer_id: string | null }>;

    const row = rows?.[0];
    if (!row?.id) return { ok: false, error: "BILLING_BINDING_METADATA_USER_NOT_FOUND" };

    const existingUserCustomer = String(row.stripe_customer_id || "").trim() || null;
    if (customerId && existingUserCustomer && existingUserCustomer !== customerId) {
      return { ok: false, error: "BILLING_BINDING_METADATA_USER_CUSTOMER_MISMATCH" };
    }

    if (customerId) {
      const ownerOfCustomer = await getUserIdByStripeCustomerId(customerId);
      if (ownerOfCustomer && ownerOfCustomer !== metadataUserId) {
        return { ok: false, error: "BILLING_BINDING_CUSTOMER_ALREADY_ASSIGNED" };
      }
    }
  } catch {
    return { ok: false, error: "BILLING_BINDING_LOOKUP_FAILED" };
  }

  return { ok: true, userId: metadataUserId };
}

export async function upsertStripeSubscription(args: StripeSubUpsertArgs): Promise<void> {
  if (!(await billingTableExists())) return;
  const userId = normalizeUuid(args.userId);
  if (!userId && !args.stripeCustomerId) return;

  const eventCreated = Number.isFinite(args.eventCreatedUnix as number)
    ? Math.max(0, Math.floor(Number(args.eventCreatedUnix)))
    : 0;
  try {
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
        last_event_created,
        updated_at
      ) values (
        ${userId}::uuid,
        ${args.stripeCustomerId},
        ${args.stripeSubscriptionId},
        ${args.status},
        ${args.planId},
        ${args.currentPeriodEnd ? args.currentPeriodEnd : null}::timestamptz,
        ${args.cancelAtPeriodEnd},
        ${args.graceUntil ? args.graceUntil : null}::timestamptz,
        ${eventCreated}::bigint,
        now()
      )
      on conflict (stripe_subscription_id)
      do update set
        user_id = coalesce(excluded.user_id, public.billing_subscriptions.user_id),
        stripe_customer_id = excluded.stripe_customer_id,
        status = excluded.status,
        plan_id = excluded.plan_id,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end,
        grace_until = excluded.grace_until,
        last_event_created = excluded.last_event_created,
        updated_at = now()
      where coalesce(public.billing_subscriptions.last_event_created, 0) <= excluded.last_event_created
    `;
  } catch {
    // Backward compatibility for schemas without last_event_created.
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
        ${userId}::uuid,
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
        user_id = coalesce(excluded.user_id, public.billing_subscriptions.user_id),
        stripe_customer_id = excluded.stripe_customer_id,
        status = excluded.status,
        plan_id = excluded.plan_id,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end,
        grace_until = excluded.grace_until,
        updated_at = now()
    `;
  }

  if (userId && args.stripeCustomerId) {
    try {
      await sql`
        update public.users
        set stripe_customer_id = ${args.stripeCustomerId}
        where id = ${userId}::uuid
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
  eventCreatedUnix: number | null;
}): Promise<void> {
  if (!(await billingTableExists())) return;

  const subId = String(args.stripeSubscriptionId || "").trim();
  const customerId = String(args.stripeCustomerId || "").trim();
  if (!subId && !customerId) return;

  const eventCreated = Number.isFinite(args.eventCreatedUnix as number)
    ? Math.max(0, Math.floor(Number(args.eventCreatedUnix)))
    : 0;
  try {
    await sql`
      update public.billing_subscriptions
      set
        status = 'past_due',
        grace_until = now() + (${Math.max(0, Math.floor(args.graceDays))}::int * interval '1 day'),
        last_event_created = ${eventCreated}::bigint,
        updated_at = now()
      where (
        (${subId} <> '' and stripe_subscription_id = ${subId})
        or (${customerId} <> '' and stripe_customer_id = ${customerId})
      )
      and coalesce(last_event_created, 0) <= ${eventCreated}::bigint
    `;
  } catch {
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
}

export async function markPaymentSucceeded(args: {
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  eventCreatedUnix: number | null;
}): Promise<void> {
  if (!(await billingTableExists())) return;

  const subId = String(args.stripeSubscriptionId || "").trim();
  const customerId = String(args.stripeCustomerId || "").trim();
  if (!subId && !customerId) return;

  const eventCreated = Number.isFinite(args.eventCreatedUnix as number)
    ? Math.max(0, Math.floor(Number(args.eventCreatedUnix)))
    : 0;
  try {
    await sql`
      update public.billing_subscriptions
      set
        status = 'active',
        grace_until = null,
        last_event_created = ${eventCreated}::bigint,
        updated_at = now()
      where (
        (${subId} <> '' and stripe_subscription_id = ${subId})
        or (${customerId} <> '' and stripe_customer_id = ${customerId})
      )
      and coalesce(last_event_created, 0) <= ${eventCreated}::bigint
    `;
  } catch {
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
}

export async function syncUserPlanFromSubscription(userId: string | null): Promise<"free" | "pro" | null> {
  const uid = normalizeUuid(userId);
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

export async function beginWebhookEvent(
  eventId: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<"new" | "duplicate"> {
  if (!(await billingTableExists())) return "new";
  const idempotencyKey = `stripe:${eventId}`;
  const eventCreatedUnix = Number.isFinite(Number(payload?.created))
    ? Math.max(0, Math.floor(Number(payload.created)))
    : null;
  try {
    const rows = (await sql`
      insert into public.billing_webhook_events (
        event_id,
        idempotency_key,
        event_type,
        event_created_unix,
        payload,
        status,
        received_at
      )
      values (
        ${eventId},
        ${idempotencyKey},
        ${eventType},
        ${eventCreatedUnix}::bigint,
        ${payload}::jsonb,
        'processing',
        now()
      )
      on conflict (event_id) do nothing
      returning event_id
    `) as unknown as Array<{ event_id: string }>;
    if (!rows?.length) {
      return "duplicate";
    }
    try {
      await sql`
        insert into public.stripe_event_log (
          event_id,
          idempotency_key,
          event_type,
          event_created_unix,
          payload,
          status,
          received_at
        )
        values (
          ${eventId},
          ${idempotencyKey},
          ${eventType},
          ${eventCreatedUnix}::bigint,
          ${payload}::jsonb,
          'processing',
          now()
        )
        on conflict (event_id)
        do update set
          idempotency_key = excluded.idempotency_key,
          event_type = excluded.event_type,
          event_created_unix = excluded.event_created_unix,
          payload = excluded.payload,
          status = excluded.status,
          received_at = excluded.received_at
      `;
    } catch {
      // optional table
    }
    return "new";
  } catch {
    // Backward compatibility for older schemas without idempotency_key/event_created_unix.
    try {
      const rows = (await sql`
        insert into public.billing_webhook_events (event_id, event_type, payload, status, received_at)
        values (${eventId}, ${eventType}, ${payload}::jsonb, 'processing', now())
        on conflict (event_id) do nothing
        returning event_id
      `) as unknown as Array<{ event_id: string }>;
      if (!rows?.length) return "duplicate";
      return "new";
    } catch {
      return "new";
    }
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
  try {
    await sql`
      update public.stripe_event_log
      set
        status = ${status},
        message = ${message},
        processed_at = now()
      where event_id = ${eventId}
    `;
  } catch {
    // optional table
  }
}

export async function markWebhookEventDuplicate(eventId: string): Promise<void> {
  if (!(await billingTableExists())) return;
  try {
    await sql`
      update public.billing_webhook_events
      set
        status = 'ignored',
        message = coalesce(message, 'duplicate_event_id'),
        processed_at = coalesce(processed_at, now())
      where event_id = ${eventId}
    `;
  } catch {
    // ignore
  }
  try {
    await sql`
      update public.stripe_event_log
      set
        status = 'duplicate',
        message = coalesce(message, 'duplicate_event_id'),
        processed_at = coalesce(processed_at, now())
      where event_id = ${eventId}
    `;
  } catch {
    // optional table
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

  if (status === "active" || status === "trialing") {
    if (Number.isFinite(periodEnd) && periodEnd <= now) return "at_risk";
    return "active";
  }
  if ((status === "past_due" || status === "grace") && Number.isFinite(graceUntil) && graceUntil > now) {
    return "grace";
  }
  if (status === "incomplete" || status === "incomplete_expired" || status === "unpaid") return "at_risk";
  if (status === "canceled" || status === "grace_expired") return "downgraded";

  return "at_risk";
}

export async function getBillingSnapshotForUser(userId: string): Promise<{
  subscription: BillingSubscriptionSnapshot;
  events: BillingWebhookEventRow[];
}> {
  const uid = normalizeUuid(userId);
  if (!uid) return { subscription: null, events: [] };
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
    where user_id = ${uid}::uuid
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

  const subId = String(sub?.stripeSubscriptionId || "").trim();
  const customerId = String(sub?.stripeCustomerId || "").trim();
  let events: BillingWebhookEventRow[] = [];
  if (subId || customerId) {
    try {
      const evRows = (await sql`
        select
          event_id::text as event_id,
          event_type::text as event_type,
          status::text as status,
          message::text as message,
          received_at::text as received_at,
          processed_at::text as processed_at
        from public.billing_webhook_events
        where
          (
            ${subId} <> ''
            and (
              coalesce(payload #>> '{data,object,id}', '') = ${subId}
              or coalesce(payload #>> '{data,object,subscription}', '') = ${subId}
            )
          )
          or (
            ${customerId} <> ''
            and coalesce(payload #>> '{data,object,customer}', '') = ${customerId}
          )
          or coalesce(payload #>> '{data,object,metadata,user_id}', '') = ${uid}
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

      events = evRows.map((r) => ({
        eventId: r.event_id,
        eventType: r.event_type,
        status: r.status,
        message: r.message ?? null,
        receivedAt: r.received_at,
        processedAt: r.processed_at ?? null,
      }));
    } catch {
      events = [];
    }
  }

  return { subscription: sub, events };
}

export async function getBillingWebhookDebugSummary(): Promise<{
  billingWebhookEventsTable: boolean;
  stripeEventLogTable: boolean;
  totalEvents: number;
  duplicateLikeEvents: number;
  failedEvents: number;
  lastEventAt: string | null;
}> {
  let billingWebhookEventsTable = false;
  let stripeEventLogTable = false;
  try {
    const rows = (await sql`
      select to_regclass('public.billing_webhook_events')::text as reg
    `) as unknown as Array<{ reg: string | null }>;
    billingWebhookEventsTable = Boolean(rows?.[0]?.reg);
  } catch {
    billingWebhookEventsTable = false;
  }
  try {
    const rows = (await sql`
      select to_regclass('public.stripe_event_log')::text as reg
    `) as unknown as Array<{ reg: string | null }>;
    stripeEventLogTable = Boolean(rows?.[0]?.reg);
  } catch {
    stripeEventLogTable = false;
  }

  if (!stripeEventLogTable && !billingWebhookEventsTable) {
    return {
      billingWebhookEventsTable,
      stripeEventLogTable,
      totalEvents: 0,
      duplicateLikeEvents: 0,
      failedEvents: 0,
      lastEventAt: null,
    };
  }

  try {
    if (stripeEventLogTable) {
      const rows = (await sql`
        select
          count(*)::int as total_events,
          count(*) filter (where lower(coalesce(status, '')) in ('duplicate'))::int as duplicate_like_events,
          count(*) filter (where lower(coalesce(status, '')) = 'failed')::int as failed_events,
          max(received_at)::text as last_event_at
        from public.stripe_event_log
      `) as unknown as Array<{
        total_events: number;
        duplicate_like_events: number;
        failed_events: number;
        last_event_at: string | null;
      }>;
      const r = rows?.[0];
      return {
        billingWebhookEventsTable,
        stripeEventLogTable,
        totalEvents: Number(r?.total_events ?? 0),
        duplicateLikeEvents: Number(r?.duplicate_like_events ?? 0),
        failedEvents: Number(r?.failed_events ?? 0),
        lastEventAt: r?.last_event_at ?? null,
      };
    }

    const rows = (await sql`
      select
        count(*)::int as total_events,
        count(*) filter (where lower(coalesce(status, '')) = 'failed')::int as failed_events,
        max(received_at)::text as last_event_at
      from public.billing_webhook_events
    `) as unknown as Array<{
      total_events: number;
      failed_events: number;
      last_event_at: string | null;
    }>;
    const r = rows?.[0];
    return {
      billingWebhookEventsTable,
      stripeEventLogTable,
      totalEvents: Number(r?.total_events ?? 0),
      duplicateLikeEvents: 0,
      failedEvents: Number(r?.failed_events ?? 0),
      lastEventAt: r?.last_event_at ?? null,
    };
  } catch {
    return {
      billingWebhookEventsTable,
      stripeEventLogTable,
      totalEvents: 0,
      duplicateLikeEvents: 0,
      failedEvents: 0,
      lastEventAt: null,
    };
  }
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

  async function readCursor(): Promise<string | null> {
    try {
      const rows = (await sql`
        select value
        from public.app_settings
        where key = 'billing_maintenance_cursor'
        limit 1
      `) as unknown as Array<{ value: { last_user_id?: unknown } | null }>;
      const raw = rows?.[0]?.value?.last_user_id;
      const value = String(raw || "").trim();
      return value || null;
    } catch {
      return null;
    }
  }

  async function writeCursor(lastUserId: string | null): Promise<void> {
    try {
      await sql`
        insert into public.app_settings (key, value)
        values (
          'billing_maintenance_cursor',
          ${JSON.stringify({
            last_user_id: lastUserId,
            updated_at: new Date().toISOString(),
          })}::jsonb
        )
        on conflict (key)
        do update set value = excluded.value
      `;
    } catch {
      // best-effort
    }
  }

  const cursor = await readCursor();
  const firstBatch = (await sql`
    select distinct user_id::text as user_id
    from public.billing_subscriptions
    where user_id is not null
      and (${cursor || ""} = '' or user_id::text > ${cursor || ""})
    order by user_id
    limit ${maxUsers}
  `) as unknown as Array<{ user_id: string }>;

  const seen = new Set<string>();
  const allRows: Array<{ user_id: string }> = [];
  for (const row of firstBatch) {
    const uid = String(row.user_id || "").trim();
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    allRows.push({ user_id: uid });
  }

  if (allRows.length < maxUsers) {
    const remaining = maxUsers - allRows.length;
    const wrapBatch = (await sql`
      select distinct user_id::text as user_id
      from public.billing_subscriptions
      where user_id is not null
      order by user_id
      limit ${remaining}
    `) as unknown as Array<{ user_id: string }>;

    for (const row of wrapBatch) {
      const uid = String(row.user_id || "").trim();
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      allRows.push({ user_id: uid });
    }
  }

  let usersScanned = 0;
  let downgradedToFree = 0;
  let errors = 0;

  for (const row of allRows) {
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

  const nextCursor = allRows.length ? allRows[allRows.length - 1].user_id : null;
  await writeCursor(nextCursor);

  return { ok: true, usersScanned, downgradedToFree, errors };
}
