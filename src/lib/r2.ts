// src/lib/r2.ts
//
// Cloudflare R2 (S3-compatible) client + shared constants.
//
// IMPORTANT:
// Browser presigned PUT uploads are sensitive to which headers are included in the signature.
// If the SDK injects x-amz-checksum-* (or you sign x-amz-server-side-encryption), browsers
// won't send those headers by default and R2 returns SignatureDoesNotMatch.
//
// Recommended approach:
// 1) Avoid signing SSE headers for browser presigned PUTs (handled in presign route).
// 2) Ask AWS SDK to NOT calculate/validate checksums (if supported by your SDK version).
//    Some @aws-sdk versions don't include the newer checksum config keys in TypeScript
//    types yet, so we apply them behind a safe `as any` cast.

import { S3Client } from "@aws-sdk/client-s3";

const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

// Keep existing exports used throughout the app.
export const r2Bucket = process.env.R2_BUCKET || process.env.R2_BUCKET_NAME || "";
export const R2_BUCKET = r2Bucket;

// Optional object key prefix (defaults to "docs/").
// Some parts of the codebase reference `r2Prefix`.
export const r2Prefix = (() => {
  const p = process.env.R2_PREFIX || "docs/";
  if (p.startsWith("r2://")) return "docs/";
  return p.endsWith("/") ? p : `${p}/`;
})();

if (!R2_ENDPOINT) throw new Error("Missing R2_ENDPOINT env var");
if (!R2_ACCESS_KEY_ID) throw new Error("Missing R2_ACCESS_KEY_ID env var");
if (!R2_SECRET_ACCESS_KEY) throw new Error("Missing R2_SECRET_ACCESS_KEY env var");
if (!r2Bucket) throw new Error("Missing R2_BUCKET env var");

// NOTE: We intentionally cast to `any` to allow newer checksum-related config keys
// even when the installed SDK's TypeScript types don't expose them.
export const r2Client = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },

  // Prevent AWS SDK from injecting checksum requirements into presigned PUT URLs.
  // (If unsupported by this SDK version at runtime, it will be ignored.)
  requestChecksumCalculation: "NEVER",
  responseChecksumValidation: "NEVER",
} as any);
