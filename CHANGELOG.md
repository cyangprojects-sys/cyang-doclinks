# Changelog

## 2026-03-01

### Security and access
- Added alias lifecycle controls (create, rename, expire, disable) with safer default TTL behavior.
- Tightened ticket replay controls and strengthened viewer gating defaults.
- Added serve-path missing-object checks with explicit telemetry for missing R2 objects.

### Billing and enforcement
- Hardened Stripe webhook flow with signature validation, duplicate handling, out-of-order resilience, and explicit idempotency key storage.
- Added Stripe event logging table support and admin billing debug visibility.
- Enforced inactive subscription downgrade paths in maintenance jobs.

### Abuse protection and rate limiting
- Expanded abuse admin visibility with active blocked IP rollups and block-hit counters.
- Added blocked IP viewer card/table on admin abuse page.

### Data integrity and maintenance
- Added orphan sweep cron endpoint and weekly orphan sweep execution path.
- Added data-integrity FK migration safeguards (`NOT VALID` + validate-on-cleanup pattern).
- Updated retention defaults for safer orphan-deletion rollout.

### Legal and documentation
- Added `/legal` section and per-document legal pages backed by markdown docs in `docs/`.
- Synced `/terms` and `/privacy` pages to markdown source docs.
- Added `.env.example` with dummy values and no real secrets.
- Added Cyang.io Proprietary `LICENSE`.

### Accessibility
- Completed admin-focused accessibility pass for form controls and labels without business-logic changes.
