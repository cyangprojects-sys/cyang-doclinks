import "server-only";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const R2_BUCKET = mustEnv("R2_BUCKET");

export function r2Client() {
  const accountId = mustEnv("R2_ACCOUNT_ID");

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: mustEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: mustEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}

export async function putObjectToR2(opts: {
  key: string;
  contentType: string;
  body: Uint8Array;
}) {
  const client = r2Client();

  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType,
    })
  );
}
