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

## Primary Proof Path

Run the pinned baseline, install from the lockfile, then use the single proof wrapper:

```bash
npm ci
npm run prove:build
```

Notes:
- `npm run prove:build` now fails fast if the runtime is not exactly Node `22.16.0` and npm `10.9.2`.
- The wrapper removes any existing `.next` directory first so the proof always rebuilds from a clean production artifact state.
- If `.env.local` is missing, the wrapper prepares it from the committed `.env.example`.
- Real production secrets are not required for the proof sequence.
- `production-readiness` and `release:gate` already degrade safely when real deployment infrastructure is not configured.
- The proof wrappers now end with an explicit pass/fail step summary so reviewers can see which exact proof stage failed.

## Exact Wrapped Sequence

`npm run prove:build` runs these checks in order:

```bash
npm run lint
npm run typecheck
npm test -- --runInBand
npm run build
npm run audit:bundle-budgets
npm run production-readiness
```

If you want to inspect the wrapper step-by-step, this is the same sequence after `npm ci`.

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
  - env-template audit, migration manifest verification, route-handler/polling/render audits, lint, typecheck, build, bundle budgets, and release gate checks

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
- runs the same `npm run prove:build` wrapper used for local proof

A successful image build is a self-contained proof that the repo can pass its release-proof path in an isolated environment.

## Windows Sandbox Note

If you run the proof or Playwright wrapper inside a restricted Windows sandbox, you may hit `spawn EPERM` before app code runs.
That is an environment/process-permission limitation, not a repository build failure.
The proof and test wrappers now surface that case explicitly so reviewers know to rerun outside the restricted sandbox.

## Known Non-Blocking Caveats

- `.env.example` intentionally keeps a small explicit set of documented extra keys. See `docs/environment-ownership.md` and `scripts/lib/env-example-manifest.mjs`.
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

## Environment Ownership

For a reviewer-friendly explanation of which env vars are required for proof, local dev, and real deploys, see:

- `docs/environment-ownership.md`
