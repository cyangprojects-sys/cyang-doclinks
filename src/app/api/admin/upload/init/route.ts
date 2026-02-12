import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { sql } from "@/lib/db";
import { r2, R2_BUCKET } from "@/lib/r2";
import { requireOwner } from "@/lib/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
    title: z.string().trim().min(1).max(200),
    originalName: z.string().trim().min(1).max(260),
    contentType: z.string().trim().min(1).max(100),
    sizeBytes: z.number().int().positive().max(250 * 1024 * 1024), // 250MB cap
});

function safePdfOnly(contentType: string, originalName: string) {
    const lower = originalName.toLowerCase();
    const isPdfName = lower.endsWith(".pdf");
    const isPdfType = contentType === "application/pdf";
    return isPdfName && isPdfType;
}

export async function POST(req: Request) {
    const owner = await requireOwner();
    if (!owner.ok) {
        return NextResponse.json({ ok: false, error: owner.reason }, { status: owner.reason === "UNAUTHENTICATED" ? 401 : 403 });
    }

    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
        return NextResponse.json({ ok: false, error: "BAD_REQUEST", details: parsed.error.flatten() }, { status: 400 });
    }

    const { title, originalName, contentType, sizeBytes } = parsed.data;

    if (!safePdfOnly(contentType, originalName)) {
        return NextResponse.json({ ok: false, error: "ONLY_PDF_ALLOWED" }, { status: 400 });
    }

    const docId = randomUUID();

    // keep keys partitioned; avoids huge flat namespaces
    const yyyy = new Date().getUTCFullYear();
    const mm = String(new Date().getUTCMonth() + 1).padStart(2, "0");
    const key = `docs/${yyyy}/${mm}/${docId}.pdf`;

    await sql`
    insert into docs (id, title, original_name, content_type, size_bytes, r2_bucket, r2_key, status)
    values (${docId}::uuid, ${title}, ${originalName}, ${contentType}, ${sizeBytes}::bigint, ${R2_BUCKET}, ${key}, 'uploading')
  `;

    const cmd = new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        ContentType: contentType,
        // Optional: attach metadata (handy for audits)
        Metadata: {
            doc_id: docId,
            original_name: originalName,
            uploaded_by: owner.email,
        },
    });

    const uploadUrl = await getSignedUrl(r2, cmd, { expiresIn: 10 * 60 }); // 10 min

    return NextResponse.json({
        ok: true,
        doc_id: docId,
        key,
        upload_url: uploadUrl,
    });
}
