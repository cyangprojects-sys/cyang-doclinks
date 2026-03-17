import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

import { sql } from "@/lib/db";
import { r2Client } from "@/lib/r2";
import { requireDocWrite, requireUser } from "@/lib/authz";
import { clientIpKey, enforceGlobalApiRateLimit, logSecurityEvent } from "@/lib/securityTelemetry";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";

export const runtime = "nodejs";
const MAX_UPLOAD_ABORT_BODY_BYTES = 8 * 1024;

const BodySchema = z.object({
  doc_id: z.string().uuid(),
});

function parseJsonBodyLength(req: NextRequest): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const out = Number(raw);
  return Number.isFinite(out) ? Math.max(0, Math.floor(out)) : 0;
}

export async function POST(req: NextRequest) {
  const ipInfo = clientIpKey(req);
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_UPLOAD_ABORT_MS", 15_000);
  try {
    return await withRouteTimeout(
      (async () => {
        const rl = await enforceGlobalApiRateLimit({
          req,
          scope: "ip:admin_upload_abort",
          limit: Number(process.env.RATE_LIMIT_ADMIN_UPLOAD_ABORT_PER_MIN || 120),
          windowSeconds: 60,
          strict: true,
        });
        if (!rl.ok) {
          return NextResponse.json(
            { ok: false, error: "RATE_LIMIT" },
            { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
          );
        }
        if (parseJsonBodyLength(req) > MAX_UPLOAD_ABORT_BODY_BYTES) {
          return NextResponse.json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
        }
        await requireUser();
        const body = await req.json().catch(() => null);
        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
        }

        const docId = parsed.data.doc_id;
        await requireDocWrite(docId);

        const rows = (await sql`
          select
            r2_bucket::text as r2_bucket,
            r2_key::text as r2_key,
            coalesce(status::text, '') as status
          from public.docs
          where id = ${docId}::uuid
          limit 1
        `) as Array<{ r2_bucket: string | null; r2_key: string | null; status: string }>;
        const row = rows[0];
        if (!row) {
          return NextResponse.json({ ok: true, removed: false, reason: "NOT_FOUND" });
        }
        if (row.status !== "uploading") {
          return NextResponse.json({ ok: true, removed: false, reason: "NOT_UPLOADING" });
        }

        if (row.r2_bucket && row.r2_key) {
          try {
            await r2Client.send(
              new DeleteObjectCommand({
                Bucket: row.r2_bucket,
                Key: row.r2_key,
              })
            );
          } catch {
            // Best effort; DB removal still prevents dangling UI rows and access paths.
          }
        }

        await sql`delete from public.docs where id = ${docId}::uuid and status = 'uploading'`;

        await logSecurityEvent({
          type: "upload_aborted",
          severity: "low",
          ip: ipInfo.ip,
          docId,
          scope: "upload_abort",
          message: "Staged upload aborted and cleaned up",
        });

        return NextResponse.json({ ok: true, removed: true });
      })(),
      timeoutMs
    );
  } catch (e: unknown) {
    if (isRouteTimeoutError(e)) {
      return NextResponse.json({ ok: false, error: "TIMEOUT" }, { status: 504 });
    }
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
