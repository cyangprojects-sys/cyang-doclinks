import { NextResponse } from "next/server";
import { z } from "zod";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { sql } from "@/lib/db";
import { r2Client, r2Bucket, r2Prefix } from "@/lib/r2";
import { requireOwner } from "@/lib/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
    .object({
        title: z.string().optional(),
        filename: z.string().optional(),
        contentType: z.string().optional(),
        sizeBytes: z.number().int().positive().optional(),

        // tolerate alternates
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
    // Use env R2_PREFIX if it's a key prefix; otherwise default.
    // If your R2_PREFIX is "r2://bucket/", ignore and use "docs/".
    const p = process.env.R2_PREFIX || "docs/";
    if (p.startsWith("r2://")) return "docs/";
    return p.endsWith("/") ? p : `${p}/`;
}

function uuid() {
    // Node runtime on Vercel supports this
    return crypto.randomUUID();
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
        return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
    }

    const { title, filename, contentType } = parsed.data;

    if (contentType !== "application/pdf") {
        return NextResponse.json({ ok: false, error: "NOT_PDF" }, { status: 400 });
    }

    const docId = uuid();
    const keyPrefix = getKeyPrefix();
    const safeName = safeKeyPart(filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`);
    const key = `${keyPrefix}${docId}_${safeName}`;

    // Signed PUT URL
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

    // We will store where the object lives.
    // Prefer new columns if present; otherwise fall back to legacy pointer.
    const pointer = `${r2Prefix}${key}`; // r2Prefix should be like "r2://<bucket>/"

    // Attempt A: newer schema
    try {
        await sql`
      insert into docs (id, title, r2_bucket, r2_key, content_type)
      values (${docId}::uuid, ${title}, ${r2Bucket}, ${key}, ${contentType})
    `;
    } catch (e1) {
        // Attempt B: legacy schema (pointer + optional title)
        try {
            // try with title first
            await sql`
        insert into docs (id, title, pointer)
        values (${docId}::uuid, ${title}, ${pointer})
      `;
        } catch (e2) {
            // Attempt C: absolute minimal legacy schema (id + pointer only)
            await sql`
        insert into docs (id, pointer)
        values (${docId}::uuid, ${pointer})
      `;
        }
    }

    return NextResponse.json({
        ok: true,
        doc_id: docId,
        upload_url: uploadUrl,
        r2_key: key,
        bucket: r2Bucket,
        expires_in: expiresIn,
    });
}
