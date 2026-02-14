import { NextResponse } from "next/server";
import { z } from "zod";
import { HeadObjectCommand } from "@aws-sdk/client-s3";

import { sql } from "@/lib/db";
import { r2Client } from "@/lib/r2";
import { requireOwner } from "@/lib/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
    docId: z.string().uuid(),
});

export async function POST(req: Request) {
    const owner = await requireOwner();
    if (!owner.ok) {
        return NextResponse.json(
            { ok: false, error: owner.reason },
            { status: owner.reason === "UNAUTHENTICATED" ? 401 : 403 }
        );
    }

    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
        return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
    }

    const { docId } = parsed.data;

    const rows = (await sql`
    select r2_bucket, r2_key
    from docs
    where id = ${docId}::uuid
    limit 1
  `) as unknown as Array<{ r2_bucket: string | null; r2_key: string | null }>;

    const doc = rows[0];
    if (!doc?.r2_bucket || !doc?.r2_key) {
        return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }

    try {
        const head = await r2Client.send(
            new HeadObjectCommand({
                Bucket: doc.r2_bucket,
                Key: doc.r2_key,
            })
        );

        const sizeBytes = Number(head.ContentLength ?? 0);
        const contentType = String(head.ContentType ?? "");

        if (sizeBytes <= 0) {
            await sql`update docs set status = 'failed' where id = ${docId}::uuid`;
            return NextResponse.json({ ok: false, error: "EMPTY_OBJECT" }, { status: 400 });
        }

        if (contentType !== "application/pdf") {
            await sql`update docs set status = 'failed' where id = ${docId}::uuid`;
            return NextResponse.json({ ok: false, error: "NOT_PDF" }, { status: 400 });
        }

        await sql`
      update docs
      set status = 'ready',
          size_bytes = ${sizeBytes}::bigint,
          content_type = ${contentType}
      where id = ${docId}::uuid
    `;

        return NextResponse.json({
            ok: true,
            doc_id: docId,
            size_bytes: sizeBytes,
            content_type: contentType,
        });
    } catch {
        await sql`update docs set status = 'failed' where id = ${docId}::uuid`;
        return NextResponse.json({ ok: false, error: "R2_HEAD_FAILED" }, { status: 400 });
    }
}
