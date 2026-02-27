import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

import { sql } from "@/lib/db";
import { r2Client } from "@/lib/r2";
import { requireDocWrite, requireUser } from "@/lib/authz";
import { clientIpKey, logSecurityEvent } from "@/lib/securityTelemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  doc_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const ipInfo = clientIpKey(req);
  try {
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
  } catch {
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}

