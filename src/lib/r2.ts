import { S3Client } from "@aws-sdk/client-s3";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

export const R2_BUCKET = required("R2_BUCKET");
export const R2_ACCOUNT_ID = required("R2_ACCOUNT_ID");

// ✅ New name
export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
  },
});

// ✅ Back-compat exports for existing code
export const r2Client = r2;
export const r2Bucket = R2_BUCKET;
export const r2Prefix = `r2://${R2_BUCKET}/` as const;

export function r2PointerForKey(key: string) {
  return `r2://${R2_BUCKET}/${key}`;
}
