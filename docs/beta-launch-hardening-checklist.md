# Beta Launch Hardening Checklist

This maps directly to the security/billing/ops gates and includes SQL + env requirements.

## 1) SQL scripts to run (in order)

1. `scripts/sql/security_encryption.sql`
2. `scripts/sql/immutable_audit.sql`
3. `scripts/sql/monetization.sql`
4. `scripts/sql/stripe_billing.sql`
5. `scripts/sql/stripe_billing_event_order.sql`
6. `scripts/sql/stripe_event_log.sql`
7. `scripts/sql/malware_scanning.sql`
8. `scripts/sql/scan_reliability.sql`
9. `scripts/sql/quarantine_override.sql`
10. `scripts/sql/backup_recovery.sql`
11. `scripts/sql/key_rotation_ops.sql`
12. `scripts/sql/view_limit_override.sql`
13. `scripts/sql/free_plan_policy_update.sql`
14. Validation pack: `scripts/sql/beta_readiness_security.sql`

## 2) Required production env vars

Core:

- `DATABASE_URL`
- `DOC_MASTER_KEYS`
- `UPLOAD_ABSOLUTE_MAX_BYTES=26214400`
- `PDF_MAX_PAGES` (recommended: `500`)
- `R2_BUCKET`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

Billing:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRO_PRICE_IDS` (comma-separated)
- `STRIPE_GRACE_DAYS` (recommended: `7`)
- `STRIPE_ENFORCE_ENTITLEMENT=1`

Rate limiting:

- `RATE_LIMIT_API_IP_PER_MIN`
- `RATE_LIMIT_UPLOAD_PRESIGN_IP_PER_MIN`
- `RATE_LIMIT_UPLOAD_COMPLETE_IP_PER_MIN`
- `RATE_LIMIT_ALIAS_GUESS_IP_PER_MIN`
- `RATE_LIMIT_TOKEN_GUESS_IP_PER_MIN`
- `RATE_LIMIT_STRIPE_WEBHOOK_IP_PER_MIN`
- `RATE_LIMIT_SERVE_IP_PER_MIN`
- `RATE_LIMIT_SERVE_TOKEN_PER_MIN`
- `RATE_LIMIT_TICKET_IP_PER_MIN`

Security/identity:

- `VIEW_SALT`
- `NEXTAUTH_SECRET`
- `CRON_SECRET`

Retention/backup:

- `RETENTION_ENABLED=true`
- `RETENTION_DAYS=90`
- `RETENTION_DAYS_DAILY=365`
- `RETENTION_DELETE_EXPIRED_SHARES=true`
- `RETENTION_AUDIT_R2_ORPHANS=true`
- `RETENTION_DELETE_R2_ORPHANS=false` (recommended default)
- `ORPHAN_SWEEP_WEEKDAY_UTC=0` (Sunday)
- `ORPHAN_SWEEP_DELETE=true` (or `false` for audit-only mode)
- `ORPHAN_SWEEP_MAX_OBJECTS=10000`

Alias/access safety defaults:

- `ALIAS_DEFAULT_TTL_DAYS=30`
- `ACCESS_TICKET_REPLAY_ENABLED=true`
- `ACCESS_TICKET_REPLAY_GRACE_SECONDS_PREVIEW=20`
- `ACCESS_TICKET_REPLAY_GRACE_SECONDS_DOWNLOAD=0`

## 3) Validation steps

### Encryption invariants

Run:

```sql
select count(*) from public.docs where coalesce(encryption_enabled,false)=false;
```

Pass condition: `0`.

Also run:

```sql
select count(*) from public.docs where coalesce(encryption_enabled,false)=true and coalesce(enc_key_version,'')='';
```

Pass condition: `0`.

### Upload abuse controls

1. Attempt upload >25MB in UI and via direct API.
2. Expected response: `413` with `FILE_TOO_LARGE` or `object_too_large`.
3. Confirm rejected object is removed from R2.

### Scan/quarantine controls

Run:

```sql
select status, count(*) from public.malware_scan_jobs group by status order by status;
```

Pass condition: no unbounded growth in `dead_letter`; quarantined/failed docs stay blocked in serve routes.

### Stripe webhook hardening

Run tests:

- `npm run test:billing:webhook:ci`
- `npm run test:attack:ci`

Pass condition: no webhook signature bypass, duplicate event IDs dedupe correctly.

Also verify `/admin/billing/stripe` debug card reports `stripe_event_log` present and duplicate counters increment after replay test.

### Security state / access controls

Run:

- `npm run test:security:state:ci`

Pass condition: expired/revoked/quarantined/disabled states block serving.

## 4) Ops checks before beta cut

1. Confirm Cloudflare cron worker is deployed and active.
2. Confirm `/api/cron/nightly` executes daily with `CRON_SECRET`.
3. Confirm weekly orphan sweep is configured (either `/api/cron/orphan-sweep` schedule or nightly weekday gate).
4. Confirm backup and recovery records update in:
   - `public.backup_runs`
   - `public.recovery_drills`
5. Confirm Admin dashboard shows:
   - Encryption health (unencrypted docs must be 0)
   - Scan queue health
   - Billing/ops widgets
   - Abuse block stats and active blocked IP viewer
