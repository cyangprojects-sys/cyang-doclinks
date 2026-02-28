# ClamAV on Hetzner VPS + Cloudflare Integration

This project now supports an external scanner endpoint:

- `MALWARE_SCANNER_URL` (required to enable external scanning)
- `MALWARE_SCANNER_AUTH_TOKEN` (optional but recommended)
- `MALWARE_SCANNER_TIMEOUT_MS` (optional, default `20000`)
- `MALWARE_SCANNER_STRICT` (optional; `true` means scanner failure => infected/high)

When `MALWARE_SCANNER_URL` is set:

1. Upload is stored in R2.
2. Doc is marked `scan_status='pending'`.
3. `/api/cron/scan` fetches object bytes and POSTs them to your scanner endpoint.
4. Serve/download remains blocked until `scan_status='clean'`.

If scanner says infected or returns strict failure, doc is quarantined by policy.

## 1) Scanner API Contract (what your VPS endpoint should accept)

Method:

- `POST /scan`

Headers:

- `content-type: application/octet-stream`
- `x-file-sha256: <sha256>`
- `x-file-size: <bytes>`
- `x-file-key: <r2 key>`
- `authorization: Bearer <token>` (if token configured)

Body:

- raw file bytes

Response JSON:

```json
{
  "verdict": "clean",
  "riskLevel": "low",
  "flags": ["clam:clean"],
  "signature": null,
  "scannerVersion": "clamd-1.4.2"
}
```

Allowed verdict values:

- `clean`
- `infected`
- `unknown`

## 2) Hetzner VPS (manual)

If ClamAV + clamd already run, only add a tiny HTTP wrapper service (Node/Go/Python) that:

1. Authenticates bearer token.
2. Receives raw bytes.
3. Sends bytes to `clamd` (INSTREAM protocol).
4. Returns the JSON contract above.

Security baseline:

- Bind scanner service to localhost (`127.0.0.1`) only.
- Put Cloudflare Tunnel in front (do not expose public port directly).
- Restrict accepted origin hostnames via Cloudflare Access.

## 3) Cloudflare Tunnel (manual)

1. Create tunnel on VPS:
   - `cloudflared tunnel login`
   - `cloudflared tunnel create clamav-scanner`
2. Route DNS:
   - `cloudflared tunnel route dns clamav-scanner scanner.cyang.io`
3. Create config (`/etc/cloudflared/config.yml`):

```yaml
tunnel: clamav-scanner
credentials-file: /root/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: scanner.cyang.io
    service: http://127.0.0.1:8088
  - service: http_status:404
```

4. Run as service:
   - `systemctl enable --now cloudflared`

Optional (recommended):

- Protect `scanner.cyang.io` with Cloudflare Access policy (service token or IP restrictions).

## 4) Vercel env vars (manual)

Set in Production (and Preview if needed):

- `MALWARE_SCANNER_URL=https://scanner.cyang.io/scan`
- `MALWARE_SCANNER_AUTH_TOKEN=<long-random-token>`
- `MALWARE_SCANNER_TIMEOUT_MS=20000`
- `MALWARE_SCANNER_STRICT=true`

Keep existing:

- `CRON_SECRET` (Cloudflare cron -> Next auth)
- `R2_*` vars

Recommended scan queue tuning:

- `SCAN_CRON_BATCH=25` (increase toward 100 as scanner capacity grows)
- `SCAN_QUEUE_STALE_ALERT_MINUTES=5`
- `SCAN_QUEUE_STALE_ALERT_COUNT=1`

## 5) Cloudflare cron worker (manual verify)

Your existing worker already calls:

- `https://www.cyang.io/api/cron/scan`

Recommended trigger for release:

- every 5 minutes (`*/5 * * * *`) for `/api/cron/scan`

No worker code changes required for ClamAV integration.

## 6) Validation checklist

1. Upload benign file.
2. Confirm DB row becomes `scan_status='pending'` then `clean`.
3. Upload EICAR test file.
4. Confirm scanner returns infected.
5. Confirm DB row becomes quarantined/blocked.
6. Confirm `/s/:token/raw`, `/d/:alias/raw`, `/t/:ticket` are blocked unless clean.

## 7) Troubleshooting

- If scanner is unreachable and `MALWARE_SCANNER_STRICT=true`, files will be blocked/quarantined (fail-safe).
- Check:
  - Cloudflare tunnel status
  - scanner service logs on VPS
  - `/api/cron/scan` output and security events (`malware_scan_job_failed`)
  - dead-letter queue in `malware_scan_jobs`
