import crypto from "crypto";
import { sql } from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";
import { appendImmutableAudit } from "@/lib/immutableAudit";

function securityTelemetryDbEnabled(): boolean {
  const explicit = String(process.env.SECURITY_TELEMETRY_DB_ENABLED || "").trim().toLowerCase();
  if (explicit === "0" || explicit === "false" || explicit === "off" || explicit === "no") return false;
  if (explicit === "1" || explicit === "true" || explicit === "on" || explicit === "yes") return true;

  const disableForTests = String(process.env.DISABLE_SECURITY_TELEMETRY_DB || "").trim().toLowerCase();
  if (disableForTests === "1" || disableForTests === "true" || disableForTests === "on" || disableForTests === "yes") {
    return false;
  }

  // Keep tests/log-only envs quiet by default unless explicitly enabled.
  if (process.env.NODE_ENV === "test") return false;

  return true;
}

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
  if (!securityTelemetryDbEnabled()) return;

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
  strict?: boolean;
}) {
  const { req, scope, limit, windowSeconds, actorUserId, orgId, strict } = args;
  const { ip, ipHash } = clientIpKey(req);

  const rl = await rateLimit({
    scope,
    id: ipHash,
    limit,
    windowSeconds,
    failClosed: Boolean(strict),
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
    if (!securityTelemetryDbEnabled()) return;

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

async function detectEventSpike(args: {
  eventType: string;
  windowMinutes: number;
  threshold: number;
  alertType: string;
  severity: "low" | "medium" | "high";
  ip?: string | null;
  scope: string;
  message: string;
  meta?: Record<string, unknown>;
}) {
  const { eventType, windowMinutes, threshold } = args;
  if (!eventType || threshold <= 0 || windowMinutes <= 0) return;

  try {
    const rows = (await sql`
      select count(*)::int as c
      from public.security_events
      where type = ${eventType}
        and created_at > now() - (${windowMinutes}::text || ' minutes')::interval
    `) as unknown as Array<{ c: number }>;
    const count = Number(rows?.[0]?.c ?? 0);
    if (count < threshold) return;

    await logSecurityEvent({
      type: args.alertType,
      severity: args.severity,
      ip: args.ip ?? null,
      scope: args.scope,
      message: args.message,
      meta: {
        sourceEvent: eventType,
        count,
        threshold,
        windowMinutes,
        ...(args.meta ?? {}),
      },
    });
  } catch {
    // ignore
  }
}

export async function detectAbuseReportSpike(args: { ip?: string | null }) {
  const threshold = Math.max(1, Number(process.env.ABUSE_REPORT_SPIKE_THRESHOLD || 20));
  const windowMinutes = Math.max(1, Number(process.env.ABUSE_REPORT_SPIKE_WINDOW_MINUTES || 10));
  await detectEventSpike({
    eventType: "abuse_report_submitted",
    threshold,
    windowMinutes,
    alertType: "abuse_report_spike",
    severity: "high",
    ip: args.ip ?? null,
    scope: "abuse_report",
    message: "Abuse report submission spike detected",
  });
}

export async function detectPresignFailureSpike(args: { ip?: string | null }) {
  const threshold = Math.max(1, Number(process.env.PRESIGN_FAILURE_SPIKE_THRESHOLD || 15));
  const windowMinutes = Math.max(1, Number(process.env.PRESIGN_FAILURE_SPIKE_WINDOW_MINUTES || 10));
  await detectEventSpike({
    eventType: "upload_presign_error",
    threshold,
    windowMinutes,
    alertType: "upload_presign_failure_spike",
    severity: "high",
    ip: args.ip ?? null,
    scope: "upload_presign",
    message: "Upload presign failures spiked",
  });
}

export async function detectScanFailureSpike() {
  const threshold = Math.max(1, Number(process.env.SCAN_FAILURE_SPIKE_THRESHOLD || 10));
  const windowMinutes = Math.max(1, Number(process.env.SCAN_FAILURE_SPIKE_WINDOW_MINUTES || 10));
  await detectEventSpike({
    eventType: "malware_scan_job_failed",
    threshold,
    windowMinutes,
    alertType: "malware_scan_failure_spike",
    severity: "high",
    scope: "scanner",
    message: "Malware scan failures spiked",
  });
}

export async function detectUploadCompletionSpike() {
  const threshold = Math.max(1, Number(process.env.UPLOAD_SPIKE_THRESHOLD || 120));
  const windowMinutes = Math.max(1, Number(process.env.UPLOAD_SPIKE_WINDOW_MINUTES || 10));
  await detectEventSpike({
    eventType: "upload_complete_success",
    threshold,
    windowMinutes,
    alertType: "upload_spike_alert",
    severity: "high",
    scope: "upload_complete",
    message: "Upload completion volume spiked",
  });
}

export async function detectDbErrorSpike() {
  const threshold = Math.max(1, Number(process.env.DB_ERROR_SPIKE_THRESHOLD || 20));
  const windowMinutes = Math.max(1, Number(process.env.DB_ERROR_SPIKE_WINDOW_MINUTES || 10));
  await detectEventSpike({
    eventType: "db_error",
    threshold,
    windowMinutes,
    alertType: "db_error_spike",
    severity: "high",
    scope: "database",
    message: "Database error rate spiked",
  });
}

export async function detectAliasAccessDeniedSpike(args: { ip?: string | null }) {
  const threshold = Math.max(1, Number(process.env.ALIAS_DENIED_SPIKE_THRESHOLD || 60));
  const windowMinutes = Math.max(1, Number(process.env.ALIAS_DENIED_SPIKE_WINDOW_MINUTES || 10));
  await detectEventSpike({
    eventType: "alias_access_denied",
    threshold,
    windowMinutes,
    alertType: "alias_guess_spike",
    severity: "high",
    ip: args.ip ?? null,
    scope: "alias_raw",
    message: "Alias access denials spiked",
  });
}

export async function detectTokenAccessDeniedSpike(args: { ip?: string | null }) {
  const threshold = Math.max(1, Number(process.env.TOKEN_DENIED_SPIKE_THRESHOLD || 80));
  const windowMinutes = Math.max(1, Number(process.env.TOKEN_DENIED_SPIKE_WINDOW_MINUTES || 10));
  await detectEventSpike({
    eventType: "share_access_denied",
    threshold,
    windowMinutes,
    alertType: "token_guess_spike",
    severity: "high",
    ip: args.ip ?? null,
    scope: "share_raw",
    message: "Share token access denials spiked",
  });
}

export async function detectViewSpike() {
  const threshold = Math.max(1, Number(process.env.VIEW_SPIKE_THRESHOLD || 2000));
  const windowMinutes = Math.max(1, Number(process.env.VIEW_SPIKE_WINDOW_MINUTES || 10));
  try {
    const rows = (await sql`
      select count(*)::int as c
      from public.doc_views
      where created_at > now() - (${windowMinutes}::text || ' minutes')::interval
    `) as unknown as Array<{ c: number }>;
    const count = Number(rows?.[0]?.c ?? 0);
    if (count < threshold) return;

    await logSecurityEvent({
      type: "view_spike_alert",
      severity: "high",
      scope: "doc_views",
      message: "Document view volume spiked",
      meta: { count, threshold, windowMinutes },
    });
  } catch {
    // ignore
  }
}

function looksLikeDbErrorMessage(message: string): boolean {
  const msg = String(message || "").toLowerCase();
  if (!msg) return false;
  return (
    msg.includes("neondberror") ||
    msg.includes("sqlstate") ||
    msg.includes("database") ||
    msg.includes("relation") ||
    msg.includes("connection") ||
    msg.includes("authentication failed") ||
    msg.includes("timeout")
  );
}

export async function logDbErrorEvent(args: {
  scope: string;
  message: string;
  ip?: string | null;
  actorUserId?: string | null;
  orgId?: string | null;
  meta?: Record<string, unknown>;
}) {
  if (!looksLikeDbErrorMessage(args.message)) return;
  await logSecurityEvent({
    type: "db_error",
    severity: "high",
    ip: args.ip ?? null,
    actorUserId: args.actorUserId ?? null,
    orgId: args.orgId ?? null,
    scope: args.scope,
    message: args.message,
    meta: args.meta ?? null,
  });
}
