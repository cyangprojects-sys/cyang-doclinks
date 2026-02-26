# Cloudflare Cron Triggers for cyang-doclinks background jobs

This Worker runs on Cloudflare Cron Triggers and calls your Next.js cron endpoints on `cyang.io`.

Current schedules:
- `*/5 * * * *` -> `/api/cron/webhooks`
- `*/10 * * * *` -> `/api/cron/scan`
- `*/15 * * * *` -> `/api/cron/key-rotation`
- `5 * * * *` -> `/api/cron/nightly`

## What you need to do in the app (cyang-doclinks)

1) **Remove Vercel cron** from `vercel.json` (Vercel Hobby plan deploys fail if crons run more than daily).
   - Delete the `crons` block.

2) Make sure your scan endpoint requires a secret, e.g. in your Next.js route:

```ts
const auth = req.headers.get("authorization") || "";
if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
  return new Response("Unauthorized", { status: 401 });
}
```

3) Set `CRON_SECRET` in **Vercel** Environment Variables.

## Deploy the Cloudflare Worker

From this folder (`cloudflare/cron-scan`):

```bash
npm i
npx wrangler login
npx wrangler secret put CRON_SECRET
npx wrangler deploy
```

### Optional settings
- Update `TARGET_WEBHOOKS_URL`, `TARGET_SCAN_URL`, `TARGET_KEY_ROTATION_URL`, and `TARGET_NIGHTLY_URL` in `wrangler.toml` if route paths differ.

## Logs
View logs in Cloudflare dashboard, or run:

```bash
npx wrangler tail
```
