# Cloudflare R2 CORS setup (required for direct-to-R2 browser uploads)

Your admin upload flow uses a **presigned PUT** directly from the browser to your R2 bucket.
Because the request includes custom headers (e.g. `x-amz-meta-doc-id`), browsers perform a CORS **preflight**.

If your R2 bucket does not allow your site origin + headers, the PUT will fail with a browser error like:
- "Cross-Origin Request Blocked"
- "NetworkError when attempting to fetch resource"
- "Failed to fetch"

## What to configure

Set a CORS rule on your R2 bucket that:
- Allows origins:
  - `https://www.cyang.io`
  - `https://cyang.io`
  - (optionally) your Vercel preview domains (recommended when testing)
- Allows methods:
  - `PUT` (upload)
  - `GET`/`HEAD` (optional, but useful for validation/tools)
- Allows headers:
  - `content-type`
  - `x-amz-meta-doc-id`
  - `x-amz-meta-orig-content-type`
  - (or use `*` for simplicity)

A ready-to-paste JSON example is in: `scripts/r2/cors.json`.

## Cloudflare Dashboard steps (no CLI)

1. Cloudflare Dashboard → **R2**
2. Click your bucket (e.g. `cyang-docs`)
3. Go to **Settings** (or **CORS** section, depending on UI)
4. Add / update CORS rules using the JSON in `scripts/r2/cors.json`
5. Save

## Security note

Prefer restricting **AllowedOrigins** to your site + preview domains rather than `*`.
Using `AllowedHeaders: ["*"]` is generally fine for presigned uploads because the signature still controls what is accepted,
but you can restrict headers further if you want.
