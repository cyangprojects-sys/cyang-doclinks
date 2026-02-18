import { NextResponse } from "next/server";
import { z } from "zod";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { sql } from "@/lib/db";
import { r2Client, r2Bucket } from "@/lib/r2";
import { requireOwner } from "@/lib/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
    title: z.string().optional(),
    filename: z.string().min(1),
    contentType: z.string().optional(),
    sizeBytes: z.number().int().positive().optional(),
});

function safeKeyPart(name: string) {
    return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").slice(0, 120);
}

function getKeyPrefix() {
    const p = process.env.R2_PREFIX || "docs/";
    if (p.startsWith("r2://")) return "docs/";
    return p.endsWith("/") ? p : `${p}/`;
}

export async function POST(req: Request) {
    try {
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

        const { title, filename } = parsed.data;
        const contentType = parsed.data.contentType ?? "application/pdf";
        const sizeBytes = parsed.data.sizeBytes ?? null;

        if (contentType !== "application/pdf") {
            return NextResponse.json({ ok: false, error: "NOT_PDF" }, { status: 400 });
        }

        const docId = crypto.randomUUID();
        const keyPrefix = getKeyPrefix();
        const safeName = safeKeyPart(
            filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`
        );
        const key = `${keyPrefix}${docId}_${safeName}`;

        const createdByEmail =
            (owner as any).email ??
            (owner as any).user?.email ??
            process.env.OWNER_EMAIL ??
            null;

        await sql`
      insert into docs (
        id,
        title,
        original_filename,
        content_type,
        size_bytes,
        r2_bucket,
        r2_key,
        created_by_email,
        status
      )
      values (
        ${docId}::uuid,
        ${title ?? filename},
        ${filename},
        ${contentType},
        ${sizeBytes}::bigint,
        ${r2Bucket},
        ${key},
        ${createdByEmail},
        'uploading'
      )
    `;

        const expiresIn = 10 * 60;

        const uploadUrl = await getSignedUrl(
            r2Client,
            new PutObjectCommand({
                Bucket: r2Bucket,
                Key: key,
                ContentType: "application/pdf",
            }),
            { expiresIn }
        );

        return NextResponse.json({
            ok: true,
            doc_id: docId,
            upload_url: uploadUrl,
            r2_key: key,
            bucket: r2Bucket,
            expires_in: expiresIn,
        });
    } catch (err: any) {
        console.error("PRESIGN ERROR:", err);
        return NextResponse.json(
            {
                ok: false,
                error: "SERVER_ERROR",
                message: err?.message ?? String(err),
            },
            { status: 500 }
        );
    }
}
