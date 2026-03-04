# Backup & Recovery Runbook

Last updated: February 26, 2026

## Scope
- Database: Neon Postgres (`DATABASE_URL`)
- Object storage: Cloudflare R2 (`R2_BUCKET`)
- Application secrets: runtime env vars (`DOC_MASTER_KEYS`, `CRON_SECRET`, etc.)

## 1) Neon Database Recovery
1. Verify automatic backups are enabled in Neon project settings.
2. Select restore target timestamp and create a restored branch/database.
3. Run smoke queries on restored DB:
   - `select count(*) from public.docs;`
   - `select count(*) from public.share_tokens;`
   - `select count(*) from public.immutable_audit_log;`
4. Point a staging deployment at restored DB and validate core flows:
   - upload
   - share create
   - view/download
5. Cut over production only after validation.

### Low-cost automation: Neon -> R2 (GitHub Actions)
Use `.github/workflows/backup-neon-to-r2.yml` for daily logical backups on free/low-cost infrastructure.

Required GitHub Secrets:
- `NEON_DATABASE_URL` (Neon Postgres connection string)
- `R2_ENDPOINT` (e.g. `https://<accountid>.r2.cloudflarestorage.com`)
- `R2_BACKUP_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

Optional GitHub Variables:
- `R2_BACKUP_PREFIX` (default: `db-backups/neon`)
- `BACKUP_STATUS_WEBHOOK_URL` (optional callback URL)

Optional GitHub Secret:
- `BACKUP_STATUS_WEBHOOK_TOKEN` (Bearer token for status webhook)

Recommended free-tier posture:
1. Keep cadence daily.
2. Set an R2 lifecycle rule on backup prefix (e.g. auto-delete after 30 days).
3. Keep Neon native restore window as your fast recovery path, and use dump backups for longer-range recovery.

Manual restore test (from a dump file):
1. Download dump from R2.
2. Restore into a non-production Neon branch:
   - `pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$TARGET_DATABASE_URL" <dump-file>`
3. Run smoke checks before any cutover.

## 2) R2 Object Recovery
1. Confirm bucket retention/versioning configuration in Cloudflare dashboard.
2. For accidental overwrite/delete:
   - restore object version if versioning is enabled
   - otherwise restore from external copy/replication target
3. Validate object metadata:
   - `doc-id`
   - `orig-content-type`
4. Re-run malware scan and integrity checks on restored objects.

## 3) Encryption Key Compromise
1. Immediately revoke compromised key in admin security panel.
2. Switch active key to a non-compromised key.
3. Enqueue key rotation jobs to rewrap all docs off compromised key.
4. Track progress in `key_rotation_jobs` until remaining count is zero.
5. Keep immutable audit exports for incident report.

## 4) Admin Account Breach
1. Revoke impacted sessions/tokens and rotate auth secrets.
2. Review immutable audit log + security events for scope of actions.
3. Revoke suspicious shares and disable suspicious docs.
4. Force key rotation if any key-management actions are suspicious.

## 5) Validation Checklist After Recovery
- Upload + complete flow works.
- Existing share links enforce policy and limits.
- Quarantined docs remain blocked unless override exists.
- Cron endpoints reachable from Cloudflare worker.
- Security event ingestion and alert spikes operating.
