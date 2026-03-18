# Prove the Build

This repository is set up so a reviewer can verify the build from a clean container or VM without relying on the original developer machine.

## Proof Baseline

- Node.js: `22.16.0`
- npm: `10.9.2`
- Package manager: `npm` with the committed `package-lock.json`

The repo also declares:
- `.nvmrc`
- `.node-version`
- `package.json` `packageManager`
- `package.json` `engines`
- `package.json` `volta`

Use the exact baseline above for the cleanest proof result.

## Proof Environment Setup

1. Copy the committed env template:

```bash
cp .env.example .env.local
```

2. Install dependencies from the lockfile:

```bash
npm ci
```

3. Install the Playwright browser used by the repo test suite:

```bash
npx playwright install --with-deps chromium
```

Notes:
- `.env.example` contains safe placeholder values intended for proof runs.
- Real production secrets are not required for the proof sequence.
- `production-readiness` and `release:gate` already degrade safely when real deployment infrastructure is not configured.

## Mandatory Release-Proof Sequence

Run these commands in this exact order:

```bash
npm ci
npm run lint
npm run typecheck
npm test -- --runInBand
npm run build
npm run audit:bundle-budgets
npm run production-readiness
```

What each command verifies:
- `npm ci`
  - lockfile fidelity and reproducible dependency install
- `npm run lint`
  - static linting and repo guardrails
- `npm run typecheck`
  - Next-aware TypeScript correctness, including `next typegen` when route validators have not been generated yet in a clean checkout
- `npm test -- --runInBand`
  - Playwright-based regression coverage against a production server
- `npm run build`
  - Next.js production build correctness
- `npm run audit:bundle-budgets`
  - route-level client bundle budget checks
- `npm run production-readiness`
  - env-template audit, migration manifest verification, route/polling/render audits, lint, typecheck, build, bundle budgets, and release gate checks

If you prefer a single wrapper after install:

```bash
npm run prove:build
```

That wrapper runs the same mandatory proof steps except for `npm ci`, which should still be run first in a fresh environment.

Why not raw `npx tsc --noEmit -p tsconfig.json` here:
- This App Router repo relies on Next-generated route validator types under `.next/types`.
- `npm run typecheck` is the truthful repo-safe proof command because it generates those files when they are missing, then runs `tsc`.
- If you want to run raw `tsc` manually, run `npx next typegen` first in the same checkout.

## Container Proof Path

The repo includes a dedicated proof image:

```bash
docker build --no-cache -f Dockerfile.proof -t cyang-doclinks-proof .
```

What this does:
- installs dependencies from `package-lock.json`
- installs the local Playwright Chromium runtime
- copies `.env.example` to `.env.local`
- runs the full proof sequence inside the container

A successful image build is a self-contained proof that the repo can pass its release-proof path in an isolated environment.

## Known Non-Blocking Caveats

- `.env.example` intentionally includes some production-only and ops-only keys that are not all statically referenced in source. The env audit reports these as informational, not failing.
- `production-readiness` skips live migration-status validation when `DATABASE_URL` is not configured with a real database. Migration manifest verification still runs and must pass.
- The proof path validates build, type safety, tests, and repo guardrails. It does not claim live third-party integrations are reachable with placeholder secrets.

## Real Infrastructure Boundaries

The following integrations are intentionally not required for proof runs:
- Postgres
- Cloudflare R2
- Resend / SMTP
- Stripe live services
- malware scanner endpoints

Those integrations are still validated structurally by config, routing, and guardrail checks. Real credentials are only required for deployment or live integration testing, not for external build proof.
