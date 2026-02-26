import crypto from "crypto";
import { sql } from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";
import { appendImmutableAudit } from "@/lib/immutableAudit";

/**
 * Hash IP address (privacy safe logging)
 */
export function hashIp(ip: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(ip);
  return hash.digest("hex");
}

/**
 * Extract the best-effort client IP from a Request/NextRequest.
 * We prefer edge / proxy headers (Cloudflare + Vercel) then fall back.
 */
export function clientIpKey(req: Request): { ip: string; ipHash: string } {
  const h = req.headers;

  // Cloudflare
  const cf = h.get("cf-connecting-ip");
  if (cf) return { ip: cf, ipHash: hashIp(cf) };

  // Common reverse-proxy headers
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return { ip: first, ipHash: hashIp(first) };
  }

  const xri = h.get("x-real-ip");
  if (xri) return { ip: xri, ipHash: hashIp(xri) };

  // Vercel sometimes provides this
  const vercel = h.get("x-vercel-forwarded-for");
  if (vercel) {
    const first = vercel.split(",")[0]?.trim();
    if (first) return { ip: first, ipHash: hashIp(first) };
  }

  // Final fallback (unknown)
  const ip = "0.0.0.0";
  return { ip, ipHash: hashIp(ip) };
}

/**
 * Log security event
 */
type SecurityEventInput = {
  type: string;
  severity: "low" | "medium" | "high";
  ip?: string | null;
  actorUserId?: string | null;
  orgId?: string | null;
  docId?: string | null;
  scope?: string | null;
  message?: string | null;
  meta?: Record<string, any> | null;
};

// Back-compat overload: old signature (type, details, ip?)
export async function logSecurityEvent(
  typeOrEvent: string | SecurityEventInput,
  details?: Record<string, any>,
  ip?: string
) {
  try {
    let ev: SecurityEventInput;
    if (typeof typeOrEvent === "string") {
      ev = {
        type: typeOrEvent,
        severity: "low",
        ip: ip ?? null,
        meta: details ?? null,
      };
    } else {
      ev = typeOrEvent;
    }

    await sql`
      insert into public.security_events (
        type,
        severity,
        ip_hash,
        actor_user_id,
        org_id,
        doc_id,
        scope,
        message,
        meta
      )
      values (
        ${ev.type},
        ${ev.severity},
        ${ev.ip ? hashIp(ev.ip) : null},
        ${ev.actorUserId ? (ev.actorUserId as any) : null}::uuid,
        ${ev.orgId ? (ev.orgId as any) : null}::uuid,
        ${ev.docId ? (ev.docId as any) : null}::uuid,
        ${ev.scope ?? null},
        ${ev.message ?? null},
        ${ev.meta ? JSON.stringify(ev.meta) : null}::jsonb
      )
    `;

    await appendImmutableAudit({
      streamKey: `security:${ev.type}`,
      action: "security.event",
      actorUserId: ev.actorUserId ?? null,
      orgId: ev.orgId ?? null,
      docId: ev.docId ?? null,
      ipHash: ev.ip ? hashIp(ev.ip) : null,
      payload: {
        severity: ev.severity,
        scope: ev.scope ?? null,
        message: ev.message ?? null,
        meta: ev.meta ?? null,
      },
    });
  } catch (err) {
    // best-effort; do not crash request paths
    console.error("Failed to log security event:", err);
  }
}

/**
 * Global API rate limiter (DB-backed)
 */
export async function enforceGlobalApiRateLimit(args: {
  req: Request;
  scope: string;
  limit: number;
  windowSeconds: number;
  actorUserId?: string | null;
  orgId?: string | null;
}) {
  const { req, scope, limit, windowSeconds, actorUserId, orgId } = args;
  const { ip, ipHash } = clientIpKey(req);

  const rl = await rateLimit({
    scope,
    id: ipHash,
    limit,
    windowSeconds,
  });

  const retryAfterSeconds = Math.max(1, rl.resetSeconds);

  if (!rl.ok) {
    // best-effort telemetry
    void logSecurityEvent({
      type: "rate_limit",
      severity: "medium",
      ip,
      actorUserId: actorUserId ?? null,
      orgId: orgId ?? null,
      scope,
      message: "Rate limit exceeded",
      meta: { count: rl.count, limit: rl.limit, windowSeconds },
    });

    return { ok: false as const, status: 429 as const, retryAfterSeconds };
  }

  return { ok: true as const, status: 200 as const, retryAfterSeconds: 0 };
}

/**
 * Log decrypt event
 */
export async function logDecryptEvent(docId: string, ip?: string) {
    try {
        await sql`
      insert into public.doc_decrypt_log (
        doc_id,
        ip_hash,
        created_at
      )
      values (
        ${docId},
        ${ip ? hashIp(ip) : null},
        now()
      )
    `
    } catch (err) {
        console.error("Failed to log decrypt event:", err)
    }
}

/**
 * Best-effort anomaly detection for sudden storage usage bursts.
 * This is a lightweight guardrail against automated abuse.
 */
export async function detectStorageSpike(args: {
  ownerId: string;
  sizeBytes: number;
  ip: string;
  orgId?: string | null;
  docId?: string | null;
}) {
  const { ownerId, sizeBytes, ip, orgId, docId } = args;

  // Single-upload threshold (default 100MB)
  const singleThreshold = Number(process.env.STORAGE_SPIKE_SINGLE_BYTES || 100 * 1024 * 1024);
  if (Number.isFinite(sizeBytes) && sizeBytes >= singleThreshold) {
    await logSecurityEvent({
      type: "storage_spike",
      severity: "medium",
      ip,
      actorUserId: ownerId,
      orgId: orgId ?? null,
      docId: docId ?? null,
      scope: "upload_complete",
      message: "Large single upload",
      meta: { sizeBytes, singleThreshold },
    });
    return;
  }

  // Burst threshold: sum of uploads over last 10 minutes (default 250MB)
  const burstThreshold = Number(process.env.STORAGE_SPIKE_BURST_BYTES || 250 * 1024 * 1024);
  try {
    const rows = (await sql`
      select coalesce(sum(size_bytes), 0)::bigint as total
      from public.docs
      where owner_id = ${ownerId}::uuid
        and created_at > now() - interval '10 minutes'
    `) as unknown as Array<{ total: number | string }>;

    const total = Number(rows?.[0]?.total ?? 0);
    if (Number.isFinite(total) && total >= burstThreshold) {
      await logSecurityEvent({
        type: "storage_spike",
        severity: "high",
        ip,
        actorUserId: ownerId,
        orgId: orgId ?? null,
        docId: docId ?? null,
        scope: "upload_burst",
        message: "High upload burst",
        meta: { totalLast10m: total, burstThreshold },
      });
    }
  } catch {
    // ignore
  }
}
