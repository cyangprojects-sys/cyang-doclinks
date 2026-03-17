# Contributing to cyang-doclinks

Thanks for taking an interest in DocLinks.

This repository is maintained as a security-first product codebase. We welcome thoughtful contributions, but we care more about correctness, trust posture, and operational discipline than raw change volume.

## Before You Open a PR

Please make sure your change is:
- grounded in the current product direction
- compatible with the security-first serving model
- small enough to review safely
- validated locally before submission

If you are proposing a significant product or architectural change, open an issue first so the direction is clear before implementation work begins.

## Local Setup

Pinned runtime:
- Node.js `24.13.0`
- npm `11.6.2`

Install and run:

```bash
npm ci
npm run dev
```

## Expected Validation

Run the relevant checks for your change. For most PRs, that means:

```bash
npm run lint
npx tsc --noEmit -p tsconfig.json
npm test
npm run build
npm run production-readiness
```

If your change touches trust surfaces, delivery controls, auth, or route behavior, do not skip validation.

## Contribution Guidelines

### Security first

Do not weaken:
- authentication or authorization
- document access controls
- share / alias / ticket enforcement
- malware, moderation, or quarantine behavior
- auditability or security logging
- rate limiting and abuse protection

### Keep changes production-ready

Please avoid:
- speculative abstractions
- dead code or unused endpoints
- noisy debug surfaces
- fake demo behavior or placeholder claims
- broad rewrites without strong justification

### Public-facing docs matter

README, trust docs, issue templates, and support surfaces are part of the product experience. Keep them clear, accurate, and customer-friendly.

## Pull Request Notes

Helpful PRs usually include:
- the problem being solved
- the risk or trust impact
- validation performed
- any env or operational changes

Use the pull request template in this repo when opening a PR.

## Security Issues

Please do not open public GitHub issues for vulnerabilities or exploit paths.

Use the private disclosure path in [SECURITY.md](SECURITY.md) instead.

## License

By contributing, you agree that your contribution is submitted under the repository's existing license terms.
