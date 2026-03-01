# Next Steps Rollout

Last updated: March 1, 2026

This is the exact rollout sequence for the latest hardening changes (billing idempotency, alias lifecycle defaults, abuse dashboards, orphan sweeps).

## 1) Database migrations

Run these SQL scripts in order:

1. `scripts/sql/monetization.sql`
2. `scripts/sql/stripe_billing.sql`
3. `scripts/sql/stripe_billing_event_order.sql`
4. `scripts/sql/stripe_event_log.sql`
5. `scripts/sql/data_integrity_constraints.sql`
6. `scripts/sql/rate_limit_counters.sql`
7. `scripts/sql/abuse_ip_blocks.sql`

If you already ran older scripts, rerunning is safe (`if not exists`/idempotent alters).

## 2) Environment settings

Set or confirm:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRO_PRICE_IDS`
- `STRIPE_ENFORCE_ENTITLEMENT=1`
- `STRIPE_GRACE_DAYS=7`
- `VIEW_SALT`
- `NEXTAUTH_SECRET`
- `CRON_SECRET`

New recommended defaults:

- `ALIAS_DEFAULT_TTL_DAYS=30`
- `RETENTION_DELETE_R2_ORPHANS=false`
- `ORPHAN_SWEEP_WEEKDAY_UTC=0` (Sunday)
- `ORPHAN_SWEEP_DELETE=true` (set false for audit-only weekly runs)
- `ORPHAN_SWEEP_MAX_OBJECTS=10000`
- `ACCESS_TICKET_REPLAY_ENABLED=true`
- `ACCESS_TICKET_REPLAY_GRACE_SECONDS_DOWNLOAD=0`
- `ACCESS_TICKET_REPLAY_GRACE_SECONDS_PREVIEW=20`
- `RATE_LIMIT_STRIPE_WEBHOOK_IP_PER_MIN=300`
- `RATE_LIMIT_SERVE_IP_PER_MIN=120`
- `RATE_LIMIT_SERVE_TOKEN_PER_MIN=240`
- `RATE_LIMIT_TICKET_IP_PER_MIN=240`

## 3) Cron routes and schedule

Routes:

- Nightly maintenance: `GET /api/cron/nightly`
- Dedicated orphan sweep: `GET /api/cron/orphan-sweep`

Optional query parameters for orphan sweep:

- `?delete=true|false`
- `?maxObjects=10000`

Suggested schedule:

- Nightly: daily at low-traffic UTC hour.
- Orphan sweep: weekly (Sunday UTC), or rely on nightly's weekday gate.

Example (if your scheduler supports URL + bearer token):

1. `GET /api/cron/nightly` once per day with `Authorization: Bearer $CRON_SECRET`
2. `GET /api/cron/orphan-sweep?delete=false` once per week with `Authorization: Bearer $CRON_SECRET`

## 4) Validation checks

### Billing and Stripe

1. Open owner billing Stripe page: `/admin/billing/stripe`.
2. Confirm debug card shows:
   - billing tables ready
   - `billing_webhook_events` present
   - `stripe_event_log` present
3. Trigger webhook tests and verify duplicate events are marked duplicate/ignored.
4. Confirm inactive subscriptions are downgraded by `/api/cron/billing-sync` and reflected in admin billing status.

### Alias lifecycle

1. Open `/admin/docs/[docId]`.
2. Create alias with TTL.
3. Rename alias.
4. Set expiration.
5. Disable alias and confirm `/d/[alias]` is blocked.

### Abuse controls

1. Open `/admin/abuse`.
2. Confirm summary cards and “Active blocked IPs” viewer load.
3. Verify block-hit counter increments after a blocked request.

### Orphan integrity

1. Run `GET /api/cron/orphan-sweep?delete=false`.
2. Confirm `scanned/deleted` counts and note text.
3. Run delete mode only after confirming counts are expected.

## 5) Actions required outside this workspace

These require your deployment/database environment access:

1. Apply SQL migrations to production/staging database.
2. Set/update environment variables in hosting provider.
3. Configure cron schedule in your hosting/orchestrator.
4. Configure Stripe webhook endpoint in Stripe dashboard to `/api/stripe/webhook`.
5. In Stripe Dashboard, ensure retries are enabled and webhook signs with the same `STRIPE_WEBHOOK_SECRET` used in deploy env.

## 6) Cutover sequence (recommended)

1. Deploy code to staging.
2. Run SQL migrations on staging, then validate `/admin/billing/stripe` and `/admin/abuse`.
3. Run `GET /api/cron/orphan-sweep?delete=false` once and review counts.
4. Promote to production.
5. Run SQL migrations on production.
6. Verify Stripe webhook deliveries are `2xx` and idempotent.
7. Enable orphan delete mode (`ORPHAN_SWEEP_DELETE=true`) only after one clean audit-only run.
