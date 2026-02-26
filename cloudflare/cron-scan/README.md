# Cloudflare Cron Trigger (every 10 minutes) for cyang-doclinks malware scanning

This Worker runs on Cloudflare's Cron Triggers and calls your existing Next.js API route on cyang.io.

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
- Update `TARGET_URL` and `HTTP_METHOD` in `wrangler.toml` if your route path/method differs.

## Logs
View logs in Cloudflare dashboard, or run:

```bash
npx wrangler tail
```
