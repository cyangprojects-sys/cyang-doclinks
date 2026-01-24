import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2 } from "@/lib/r2";

export async function getR2SignedGetUrl(opts: {
  bucket: string;
  key: string;
  expiresInSeconds?: number; // default 300 (5 min)
  downloadName?: string;     // optional Content-Disposition filename
}) {
  const { bucket, key, expiresInSeconds = 300, downloadName } = opts;

  const cmd = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ...(downloadName
      ? {
          ResponseContentDisposition: `inline; filename="${downloadName.replace(/"/g, "")}"`,
        }
      : {}),
  });

  return getSignedUrl(r2, cmd, { expiresIn: expiresInSeconds });
}
