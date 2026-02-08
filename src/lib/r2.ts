import { S3Client } from "@aws-sdk/client-s3";

function must(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const r2Client = new S3Client({
  region: "auto",
  endpoint: must("R2_ENDPOINT"),
  credentials: {
    accessKeyId: must("R2_ACCESS_KEY_ID"),
    secretAccessKey: must("R2_SECRET_ACCESS_KEY"),
  },
});
