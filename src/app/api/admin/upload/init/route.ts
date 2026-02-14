import { NextResponse } from "next/server";
import { z } from "zod";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { sql } from "@/lib/db";
import { r2Client, r2Bucket } from "@/lib/r2";
import { requireOwner } from "@/lib/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
    .object({
        // new uploader fields
        title: z.string().optional(),
        filename: z.string().optional(),
        contentType: z.string().optional(),
        sizeBytes: z.number().int().positive().optional(),

        // tolerate older/alt field names
        fileName: z.string().optional(),
        content_type: z.string().optional(),
        size_bytes: z.number().int().positive().optional(),
    })
    .transform((v) => {
        const filename = v.filename ?? v.fileName ?? "upload.pdf";
        const contentType = v.contentType ?? v.content_type ?? "application/pdf";
        const sizeBytes = v.sizeBytes ?? v.size_bytes ?? undefined;
        const title = v.title ?? filename;
        return { title, filename, contentType, sizeBytes };
    });

function safeKeyPart(name: string) {
    return name
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 120);
}

function getKeyPrefix() {
    // You have R2_PREFIX in Vercel already; treat it as KEY prefix (not r2://...)
    const p = process.env.R2_PREFIX || "docs/";
    return p.endsWith("/") ? p : `${p}/`;
}

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
        return NextResponse.json(
            { ok: false, error: "BAD_REQUEST" },
            { status: 400 }
        );
    }

    const { title, filename, contentType, sizeBytes } = parsed.data;

    // Enforce PDF
    if (contentType !== "application/pdf") {
        return NextResponse.json({ ok: false, error: "NOT_PDF" }, { status: 400 });
    }

    // Generate ids/keys
    const docId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : require("crypto").randomUUID();

    const keyPrefix = getKeyPrefix();
    const safeName = safeKeyPart(filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`);
    const key = `${keyPrefix}${docId}_${safeName}`;

    // Insert DB row (attempt richer schema first, then fall back)
    try {
        await sql`
      insert into docs (id, title, status, r2_bucket, r2_key, content_type, size_bytes)
      values (
        ${docId}::uuid,
        ${title},
        'uploading',
        ${r2Bucket},
        ${key},
        ${contentType},
        ${sizeBytes ?? null}
      )
    `;
    } catch {
        // fallback if your docs table doesn't have some of those columns
        await sql`
      insert into docs (id, status, r2_bucket, r2_key)
      values (${docId}::uuid, 'uploading', ${r2Bucket}, ${key})
    `;
    }

    // Signed PUT URL for direct browser upload
    const expiresIn = 10 * 60; // 10 minutes
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
}
