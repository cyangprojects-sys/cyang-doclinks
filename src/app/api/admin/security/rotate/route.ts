import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/rbac";
import { rotateDocKeys } from "@/lib/masterKeys";
import { logSecurityEvent } from "@/lib/securityTelemetry";
import { enqueueKeyRotationJob } from "@/lib/keyRotationJobs";
import { appendImmutableAudit } from "@/lib/immutableAudit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  from_key_id: z.string().min(1),
  to_key_id: z.string().optional(),
  limit: z.number().int().positive().max(2000).optional(),
  async_job: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
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
  } catch (e: any) {
    const status = e?.message === "FORBIDDEN" || e?.message === "UNAUTHENTICATED" ? 403 : 500;
    return NextResponse.json({ ok: false, error: status === 403 ? "FORBIDDEN" : "SERVER_ERROR" }, { status });
  }
}
