import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/rbac";
import { rotateDocKeys } from "@/lib/masterKeys";
import { enforceGlobalApiRateLimit, logSecurityEvent } from "@/lib/securityTelemetry";
import { enqueueKeyRotationJob } from "@/lib/keyRotationJobs";
import { appendImmutableAudit } from "@/lib/immutableAudit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_SECURITY_ROTATE_BODY_BYTES = 8 * 1024;

const Body = z.object({
  from_key_id: z.string().trim().regex(KEY_ID_RE),
  to_key_id: z.string().trim().regex(KEY_ID_RE).optional(),
  limit: z.number().int().positive().max(2000).optional(),
  async_job: z.boolean().optional(),
}).strict();

function parseJsonBodyLength(req: Request): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const out = Number(raw);
  return Number.isFinite(out) ? Math.max(0, Math.floor(out)) : 0;
}

function authErrorCode(e: unknown): "UNAUTHENTICATED" | "FORBIDDEN" | null {
  const message = e instanceof Error ? e.message : String(e || "");
  if (message === "UNAUTHENTICATED") return "UNAUTHENTICATED";
  if (message === "FORBIDDEN") return "FORBIDDEN";
  return null;
}

export async function POST(req: Request) {
  try {
    const rl = await enforceGlobalApiRateLimit({
      req,
      scope: "ip:admin_security_rotate",
      limit: Number(process.env.RATE_LIMIT_ADMIN_SECURITY_KEY_OPS_PER_MIN || 120),
      windowSeconds: 60,
      strict: true,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: "RATE_LIMIT" },
        { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }
    if (parseJsonBodyLength(req) > MAX_SECURITY_ROTATE_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
    }
    const u = await requirePermission("security.keys.manage");
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

    const asyncJob = parsed.data.async_job ?? true;

    if (asyncJob) {
      const toKeyId = parsed.data.to_key_id || "";
      if (!toKeyId) {
        return NextResponse.json(
          { ok: false, error: "TO_KEY_REQUIRED", message: "to_key_id is required for async rotation job." },
          { status: 400 }
        );
      }
      if (toKeyId === parsed.data.from_key_id) {
        return NextResponse.json({ ok: false, error: "NOOP_ROTATION" }, { status: 400 });
      }
      const job = await enqueueKeyRotationJob({
        fromKeyId: parsed.data.from_key_id,
        toKeyId,
        maxBatch: parsed.data.limit ?? 250,
        requestedByUserId: u.id,
      });

      try {
        await appendImmutableAudit({
          streamKey: "security:key-management",
          action: "encryption.key.rotate.enqueued",
          actorUserId: u.id,
          subjectId: job.id,
          payload: {
            fromKeyId: parsed.data.from_key_id,
            toKeyId,
            limit: parsed.data.limit ?? 250,
            mode: "async",
          },
        });
      } catch {
        // ignore immutable audit failures to avoid blocking control-plane operation
      }

      void logSecurityEvent({
        type: "master_key_rotate_job_enqueued",
        severity: "medium",
        actorUserId: u.id,
        orgId: u.orgId ?? null,
        scope: "crypto",
        message: "Master key rotation job enqueued",
        meta: { from: parsed.data.from_key_id, to: toKeyId, jobId: job.id, limit: parsed.data.limit ?? 250 },
      });

      return NextResponse.json({ ok: true, job_id: job.id, mode: "async" });
    }

    if (parsed.data.to_key_id && parsed.data.to_key_id === parsed.data.from_key_id) {
      return NextResponse.json({ ok: false, error: "NOOP_ROTATION" }, { status: 400 });
    }

    const res = await rotateDocKeys({
      fromKeyId: parsed.data.from_key_id,
      toKeyId: parsed.data.to_key_id,
      limit: parsed.data.limit ?? 250,
    });

    try {
      await appendImmutableAudit({
        streamKey: "security:key-management",
        action: "encryption.key.rotate.executed",
        actorUserId: u.id,
        subjectId: parsed.data.from_key_id,
        payload: {
          fromKeyId: parsed.data.from_key_id,
          toKeyId: parsed.data.to_key_id ?? "active",
          limit: parsed.data.limit ?? 250,
          mode: "sync",
          scanned: res.scanned,
          rotated: res.rotated,
          failed: res.failed,
          remaining: res.remaining,
        },
      });
    } catch {
      // ignore immutable audit failures to avoid blocking control-plane operation
    }

    void logSecurityEvent({
      type: "master_key_rotate",
      severity: "medium",
      actorUserId: u.id,
      orgId: u.orgId ?? null,
      scope: "crypto",
      message: "Rewrapped document data keys",
      meta: { from: parsed.data.from_key_id, to: parsed.data.to_key_id ?? "active", rotated: res.rotated, failed: res.failed, remaining: res.remaining },
    });

    return NextResponse.json({ ok: true, mode: "sync", rotated: res.rotated, failed: res.failed, scanned: res.scanned, remaining: res.remaining });
  } catch (e: unknown) {
    const authCode = authErrorCode(e);
    if (authCode === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (authCode === "FORBIDDEN") {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
