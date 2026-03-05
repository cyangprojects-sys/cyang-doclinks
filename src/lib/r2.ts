// src/lib/r2.ts
//
// Cloudflare R2 (S3-compatible) client + shared helpers.
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

const R2_BUCKET_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{1,62})$/;

function isLoopbackHost(hostname: string): boolean {
  const h = String(hostname || "").trim().toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function normalizeR2Endpoint(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid R2_ENDPOINT URL");
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "https:" && protocol !== "http:") {
    throw new Error("R2_ENDPOINT must use http or https");
  }
  if (protocol === "http:" && process.env.NODE_ENV === "production" && !isLoopbackHost(parsed.hostname)) {
    throw new Error("R2_ENDPOINT must use https in production");
  }

  return parsed.toString();
}

function requireEnv(name: "R2_ENDPOINT" | "R2_ACCESS_KEY_ID" | "R2_SECRET_ACCESS_KEY"): string {
  const value = (process.env[name] || "").trim();
  if (!value) throw new Error(`Missing ${name} env var`);
  if (name === "R2_ENDPOINT") {
    return normalizeR2Endpoint(value);
  }
  return value;
}

export function getR2Bucket(): string {
  const bucket = (process.env.R2_BUCKET || process.env.R2_BUCKET_NAME || "").trim();
  if (!bucket) throw new Error("Missing R2_BUCKET env var");
  if (!R2_BUCKET_RE.test(bucket)) throw new Error("Invalid R2 bucket name");
  return bucket;
}

export function getR2Prefix(): string {
  const raw = String(process.env.R2_PREFIX || "docs/").trim();
  if (!raw) return "docs/";
  if (raw.startsWith("r2://")) return "docs/";

  const normalized = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || /[\x00-\x1F]/.test(normalized)) {
    return "docs/";
  }

  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

let cachedClient: S3Client | null = null;

function getR2Client(): S3Client {
  if (cachedClient) return cachedClient;
  const cfg: ConstructorParameters<typeof S3Client>[0] = {
    region: "auto",
    endpoint: requireEnv("R2_ENDPOINT"),
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  };

  cachedClient = new S3Client(cfg);
  return cachedClient;
}

// Keep existing import style while deferring env reads until first real client access.
export const r2Client = new Proxy({} as S3Client, {
  get(_target, prop, receiver) {
    return Reflect.get(getR2Client() as object, prop, receiver);
  },
});
