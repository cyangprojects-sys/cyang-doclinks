# Staging Fire Drill

Last updated: March 15, 2026

Run the staging validation pack with real staging env vars:

```bash
npm run fire-drill:staging
```

This covers:

- release-gate config validation
- build success
- upload / encrypt / share / revoke / expire checks via `tests/security-state.spec.ts`
- password/email restricted access checks via `tests/security-state.spec.ts`
- malware/quarantine blocking via `tests/security-state.spec.ts`
- incident freeze path via `tests/security-freeze.spec.ts`
- Stripe webhook flow via `tests/billing-webhook.spec.ts`
- backup/report verification via `npm run restore:verify -- --require-current-migrations`

## Manual Follow-ups

After the scripted fire drill, verify:

1. `/api/health/live`
2. `/api/health/ready`
3. `/api/health/deps`
4. `/api/backup/status` is receiving real backup reports
5. key rotation queues in the admin security surface show no failed jobs

## Expected Operator Artifacts

- release-gate output archived in the deploy record
- migration status output archived in the deploy record
- latest backup/restore verification output archived in the deploy record
- any incident-freeze test evidence linked from the deployment checklist
