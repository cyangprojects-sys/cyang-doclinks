# Stripe Billing Runbook

## Purpose
Enable paid plan enforcement with signed Stripe webhooks and deterministic plan state transitions.

## Database Prerequisites
Run:

```sql
scripts/sql/monetization.sql
scripts/sql/stripe_billing.sql
```

## Required Environment Variables
1. `STRIPE_SECRET_KEY`
2. `STRIPE_WEBHOOK_SECRET`
3. `STRIPE_PRO_PRICE_IDS` (comma-separated, first value is default checkout price)

Optional:
1. `STRIPE_GRACE_DAYS` (default `7`)
2. `STRIPE_WEBHOOK_TOLERANCE_SECONDS` (default `300`)
3. `STRIPE_ENFORCE_ENTITLEMENT` (`1` default, set `0` only for controlled testing)

## Endpoints
1. Owner checkout: `POST /api/admin/billing/checkout`
2. Customer portal: `POST /api/admin/billing/portal`
3. Stripe webhook: `POST /api/stripe/webhook`
4. Billing maintenance sync: `GET /api/cron/billing-sync`
5. Manual billing maintenance run: `POST /api/admin/billing/sync`
6. Billing status snapshot: `GET /api/admin/billing/status`
7. Invoice history API: `GET /api/admin/billing/invoices`

## Webhook Events Handled
1. `customer.subscription.created`
2. `customer.subscription.updated`
3. `customer.subscription.deleted`
4. `invoice.payment_failed`
5. `invoice.payment_succeeded`

## Enforcement Notes
1. User `plan_id='pro'` is treated as Free unless active Stripe entitlement is present.
2. `past_due` enters grace window (`grace_until`).
3. Expired grace or canceled subscription downgrades user to Free.
4. Free plan cannot create unlimited share links.
5. Free plan cannot export audit logs.

## Validation Checklist
1. Trigger checkout from `/admin/billing` and confirm redirect to Stripe Checkout.
2. Complete payment in Stripe test mode and verify webhook updates `billing_subscriptions`.
3. Confirm `users.plan_id` becomes `pro`.
4. Simulate `invoice.payment_failed`; confirm `past_due` + `grace_until`.
5. Simulate cancellation or grace expiry; confirm downgrade to `free`.
6. Trigger `/api/cron/billing-sync` (via Cloudflare cron) and verify stale past-due users are downgraded.
