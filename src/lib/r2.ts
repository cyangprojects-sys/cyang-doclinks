// src/lib/r2.ts
//
// Cloudflare R2 (S3-compatible) client + shared constants.
//
// IMPORTANT:
// - Browser-based presigned PUT uploads are extremely sensitive to which headers are included
//   in the signature. If we sign x-amz-checksum-* or x-amz-server-side-encryption headers,
//   the browser must send them exactly, or R2 will return SignatureDoesNotMatch.
// - For reliability, we disable checksum calculation/validation at the SDK layer and avoid
//   signing SSE headers on presigned browser PUTs (handled elsewhere if needed).

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

if (!R2_ENDPOINT) {
  // Fail fast in server environments; but keep message explicit.
  throw new Error("Missing R2_ENDPOINT env var");
}
if (!R2_ACCESS_KEY_ID) {
  throw new Error("Missing R2_ACCESS_KEY_ID env var");
}
if (!R2_SECRET_ACCESS_KEY) {
  throw new Error("Missing R2_SECRET_ACCESS_KEY env var");
}
if (!r2Bucket) {
  throw new Error("Missing R2_BUCKET env var");
}

export const r2Client = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },

  // Prevent AWS SDK from adding x-amz-checksum-* requirements to presigned URLs.
  // This is supported by modern @aws-sdk/* versions; if your version is older,
  // TypeScript may complain — but your build uses Turbopack + TS, so this should
  // remain compatible with the version in package-lock.
  requestChecksumCalculation: "NEVER",
  responseChecksumValidation: "NEVER",
});
