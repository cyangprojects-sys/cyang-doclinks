# Staged DAST Audit - 2026-03-05

## Scope

1. Runtime oversized-payload behavior (public API routes).
2. Burst/rate-limit behavior on public unauthenticated signup endpoints.

## Runtime oversized-payload checks

Executed via route-handler runtime tests in:

- `tests/runtime-oversized-payloads.spec.ts`

Validated `413 PAYLOAD_TOO_LARGE` responses for:

- `POST /api/v1/abuse/report`
- `POST /api/v1/takedown`
- `POST /api/v1/aliases`
- `POST /api/v1/shares`
- `POST /api/backup/status`

## Rate-limit burst checks (DAST stage)

Executed via staged burst tests in:

- `tests/public-rate-limit-dast.spec.ts`

Validated throttling (`429`) under low temporary thresholds for:

- `POST /api/auth/manual-signup`
- `POST /api/auth/signup-consent`

## Outcome

- Runtime oversized-payload and staged rate-limit checks passed in this sweep.
- No new high-severity failures were identified in tested routes.
