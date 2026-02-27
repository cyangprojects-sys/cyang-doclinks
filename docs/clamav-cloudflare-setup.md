# ClamAV + Cloudflare Setup (cyang-doclinks)

This repo now supports two malware scan backends:

1. `CLAMAV_SCAN_URL` (preferred)
2. VirusTotal hash lookup fallback (`VIRUSTOTAL_API_KEY`)

If `CLAMAV_SCAN_URL` is set, the cron scanner uses it first.

## What is already done in code

- `/api/cron/scan` already processes queued jobs.
- `src/lib/malwareScan.ts` now:
  - downloads R2 object
  - computes SHA-256
  - calls `CLAMAV_SCAN_URL` with raw bytes
  - falls back to VirusTotal hash lookup if ClamAV URL is not configured

No extra app code changes are required after environment setup.

## Manual steps you need to do

## 1) Deploy ClamAV scanner service

A deployable scaffold is included at:

- `infra/clamav-service/Dockerfile`
- `infra/clamav-service/server.js`

This service exposes:

- `GET /health`
- `POST /scan` (octet-stream body)

Auth header:

- `Authorization: Bearer <CLAMAV_SCAN_TOKEN>`

Expected JSON response:

```json
{
  "ok": true,
  "verdict": "clean|infected|unknown",
  "infected": false,
  "signature": null,
  "sha256": "..."
}
```

## 2) Set app environment variables (Vercel)

Set these in Vercel (Production):

- `CLAMAV_SCAN_URL=https://<your-clamav-service>/scan`
- `CLAMAV_SCAN_TOKEN=<long-random-secret>`
- `CLAMAV_SCAN_TIMEOUT_MS=30000` (optional)
- `SCAN_ABS_MAX_BYTES=25000000` (optional if not already set)
- `CRON_SECRET=<long-random-secret>` (must match Cloudflare Worker secret)

Keep existing required vars:

- `DATABASE_URL`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`

Optional fallback:

- `VIRUSTOTAL_API_KEY` (used only when `CLAMAV_SCAN_URL` is missing)

## 3) Cloudflare cron worker

Use existing worker in `cloudflare/cron-scan`.

Set secret:

```bash
cd cloudflare/cron-scan
npx wrangler secret put CRON_SECRET
```

Deploy:

```bash
npx wrangler deploy
```

`wrangler.toml` already points `TARGET_SCAN_URL` to:

- `https://www.cyang.io/api/cron/scan`

## 4) Database SQL (if not already run)

Run:

- `scripts/sql/malware_scanning.sql`
- `scripts/sql/scan_reliability.sql`

## 5) Verification

1. Upload a safe test file.
2. Confirm queued job:

```sql
select d.id, d.scan_status, j.status, j.attempts, j.last_error
from public.docs d
left join public.malware_scan_jobs j on j.doc_id = d.id
order by d.created_at desc
limit 10;
```

3. Trigger scan manually:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://www.cyang.io/api/cron/scan
```

4. Confirm status moves from `queued` to `clean` (or `quarantined`).

