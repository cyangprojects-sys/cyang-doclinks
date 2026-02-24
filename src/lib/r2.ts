import { S3Client } from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 S3-compatible client.
 *
 * Recommended path for browser presigned PUT uploads:
 * - Disable checksum calculation/validation so presigned URLs do not require x-amz-checksum-* headers.
 *   Browsers typically do not send these headers, which causes SignatureDoesNotMatch.
 */

export const r2Bucket = process.env.R2_BUCKET || "";

const endpoint = process.env.R2_ENDPOINT;
if (!endpoint) {
  // Keep this as a hard failure so misconfig is caught early in logs.
  throw new Error("R2_ENDPOINT is required");
}

const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
if (!accessKeyId || !secretAccessKey) {
  throw new Error("R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required");
}

export const r2Client = new S3Client({
  region: "auto",
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },

  // These options exist on newer AWS SDK v3 builds.
  // Cast to any so we can be compatible across minor versions without breaking TypeScript.
  ...( {
    requestChecksumCalculation: "NEVER",
    responseChecksumValidation: "NEVER",
  } as any ),
});
