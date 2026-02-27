# cyang-doclinks

Secure document delivery with server-enforced magic links.

This project is not "public file hosting with pretty URLs". It is a policy-enforced link system where every view request is resolved, authorized, metered, and audited before content is served.

## What This Project Is For

`cyang-doclinks` is designed for teams that need to share documents quickly without giving up control after the link is sent.

Core goals:
- Make sharing easy for legitimate users (short links, minimal friction).
- Enforce access policy on every request (not just at share creation time).
- Keep operator visibility high (audit logs, admin actions, abuse controls).
- Preserve recoverability and operational discipline (cron jobs, retention flows, security guardrails).

## Magic Link Model (Deep Dive)

### 1. Upload and registration
A user uploads a PDF through the admin upload flow. The system:
- Validates upload constraints.
- Encrypts data by default.
- Stores document metadata and pointer information.
- Records immutable audit events.

### 2. Share token creation
A share action mints a token (magic link) with optional controls such as:
- expiration timestamp
- max views
- password and/or recipient email checks
- geo/policy restrictions
- watermark behavior

The output is a user-facing link under `/s/[token]`.

### 3. Resolve + gate on each access
When a viewer opens a magic link, the app does not trust the URL alone. It resolves token state and enforces gates in real time:
- revoked? deny
- expired? deny
- maxed out? deny
- password/email requirements unmet? deny
- moderation/quarantine/scan state blocked? deny
- plan quota exceeded? deny or degrade based on policy

Only after passing gates is a short-lived ticket minted for actual content serving.

### 4. Ticketed content serving
The document stream path uses short-lived tickets and hardened headers. This reduces direct object exposure and helps avoid long-lived capability leaks.

### 5. Audit and analytics trail
High-value actions append to immutable logs (uploads, views, shares, security/admin actions). This supports forensic review and operational reporting.

## Security and Trust Boundaries

The system follows a layered model:
- Identity/role checks for admin and owner surfaces.
- Token- and alias-based policy checks at serving boundaries.
- Object storage is private by default.
- Files failing moderation/scan/quarantine policy are blocked from serving.
- Rate limiting and abuse telemetry protect sensitive endpoints.

Important principle: possession of a URL is not sufficient authority.

## Admin and Operator Workflows

Owner/admin surfaces include tools for:
- upload and document lifecycle management
- share/token revocation and policy updates
- audit log inspection/export
- abuse and moderation actions
- security key and rotation operations
- plan limit overrides and operational controls

Viewer-facing users get reduced dashboard scope and least-privilege actions.

## Architecture (Practical)

- Framework: Next.js App Router (server routes + server actions)
- Data: Postgres (Neon in deployed environments)
- Object storage: Cloudflare R2
- Scheduled operations: Cloudflare cron workers + app cron routes
- Monitoring hooks: structured security/operational telemetry

## Local Development

### Prerequisites
- Node.js 20+
- npm
- A configured database and required app secrets/env vars

### Run
```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

### Build check (recommended before push)
```bash
npm run build
```

## Browser Accessibility and Quality Audits

### Axe (Playwright)
Runs WCAG-focused checks on rendered pages:
```bash
npm run test:a11y:ci
```

### Local browser audit
Runs axe checks locally:
```bash
npm run audit:browser
```

### Lighthouse (optional local, standard in CI)
```bash
npm run audit:lighthouse
```

## API and Route Surface

Representative areas:
- Admin APIs under `/api/admin/*`
- Public share flow under `/s/[token]`, `/s/[token]/view`, `/s/[token]/raw`
- Ticketed content serving under `/t/[ticketId]`
- Alias/document flows under `/d/[alias]`

## Project Status

This repo is actively hardened for secure beta operation:
- encryption-by-default posture
- stronger serve-path controls
- immutable audit logging
- monetization/usage enforcement hooks
- org membership/invite foundation
- cloud cron-backed maintenance operations

## License

Private/internal use unless explicitly licensed otherwise.
