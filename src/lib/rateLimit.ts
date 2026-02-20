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

export function stableHash(input: string, saltEnv: string = "VIEW_SALT"): string {
  const salt = (process.env[saltEnv] || process.env.VIEW_SALT || "").trim();
  if (!salt) {
    // Fall back to an unhashed-but-shortened value if salt is missing.
    // This is still safe-ish (not PII expansion) but less ideal.
    return (input || "unknown").slice(0, 64);
  }
  return crypto.createHmac("sha256", salt).update(input || "").digest("hex").slice(0, 32);
}

export async function rateLimit(args: {
  scope: string;
  id: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const limit = Math.max(1, Math.floor(args.limit));
  const windowSeconds = Math.max(1, Math.floor(args.windowSeconds));
  const now = nowEpochSeconds();
  const bucket = bucketFor(windowSeconds, now);

  // reset at next bucket boundary
  const resetSeconds = (bucket + 1) * windowSeconds - now;

  try {
    const rows = (await sql`
      insert into public.rate_limit_counters (scope, id, bucket, count)
      values (${args.scope}, ${args.id}, ${bucket}::bigint, 1)
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
    // If the table is missing or DB is unavailable, fail open.
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
