// src/lib/rateLimit.ts
// DB-backed rate limiting helpers.
//
// Design goals:
//  - Serverless-safe (no in-memory state)
//  - Simple primitives that can be composed for:
//      * IP-based rate limiting
//      * token abuse protection
//      * password brute-force throttling
//
// Requires: scripts/sql/rate_limit_counters.sql

import crypto from "crypto";
import { sql } from "@/lib/db";
import { getHashingSalt } from "@/lib/envConfig";

const MAX_LIMIT = 10_000;
const MAX_WINDOW_SECONDS = 86_400;
const MAX_SCOPE_LEN = 96;
const MAX_ID_LEN = 256;
const MAX_HASH_INPUT_LEN = 2048;

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
  bucket: number;
  count: number;
};

function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function bucketFor(windowSeconds: number, epochSeconds: number): number {
  return Math.floor(epochSeconds / windowSeconds);
}

function boundedInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function normalizeKey(value: unknown, maxLen: number): string {
  return String(value || "").trim().slice(0, maxLen);
}

export function stableHash(input: string, saltEnv: string = "VIEW_SALT"): string {
  const salt = getHashingSalt(saltEnv) || "";
  const safeInput = String(input || "").slice(0, MAX_HASH_INPUT_LEN);
  if (!salt) {
    const allowInsecureFallback =
      String(process.env.DEV_ALLOW_INSECURE_FALLBACK || "").trim() === "1" &&
      process.env.NODE_ENV !== "production";
    if (allowInsecureFallback) {
      return crypto.createHash("sha256").update(safeInput).digest("hex").slice(0, 32);
    }
    throw new Error("Missing hashing secret (set VIEW_SALT or NEXTAUTH_SECRET).");
  }
  return crypto.createHmac("sha256", salt).update(safeInput).digest("hex").slice(0, 32);
}

export async function rateLimit(args: {
  scope: string;
  id: string;
  limit: number;
  windowSeconds: number;
  failClosed?: boolean;
}): Promise<RateLimitResult> {
  const limit = boundedInt(args.limit, 1, 1, MAX_LIMIT);
  const windowSeconds = boundedInt(args.windowSeconds, 60, 1, MAX_WINDOW_SECONDS);
  const scope = normalizeKey(args.scope, MAX_SCOPE_LEN);
  const id = normalizeKey(args.id, MAX_ID_LEN);
  const now = nowEpochSeconds();
  const bucket = bucketFor(windowSeconds, now);
  const failClosed = Boolean(args.failClosed);

  if (!scope || !id) {
    return {
      ok: false,
      limit,
      remaining: 0,
      resetSeconds: windowSeconds,
      bucket,
      count: limit + 1,
    };
  }

  // reset at next bucket boundary
  const resetSeconds = (bucket + 1) * windowSeconds - now;

  try {
    const rows = (await sql`
      insert into public.rate_limit_counters (scope, id, bucket, count)
      values (${scope}, ${id}, ${bucket}::bigint, 1)
      on conflict (scope, id, bucket)
      do update set
        count = public.rate_limit_counters.count + 1,
        updated_at = now()
      returning count
    `) as unknown as Array<{ count: number }>;

    const count = Number(rows?.[0]?.count ?? 1);
    const remaining = Math.max(0, limit - count);
    return {
      ok: count <= limit,
      limit,
      remaining,
      resetSeconds: Math.max(1, resetSeconds),
      bucket,
      count,
    };
  } catch {
    // If the table is missing or DB is unavailable, optionally fail closed.
    if (failClosed) {
      return {
        ok: false,
        limit,
        remaining: 0,
        resetSeconds: windowSeconds,
        bucket,
        count: limit + 1,
      };
    }
    return {
      ok: true,
      limit,
      remaining: limit,
      resetSeconds: windowSeconds,
      bucket,
      count: 0,
    };
  }
}

export function rateLimitHeaders(res: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(res.limit),
    "X-RateLimit-Remaining": String(res.remaining),
    "X-RateLimit-Reset": String(res.resetSeconds),
  };
}
