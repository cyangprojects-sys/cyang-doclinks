// src/app/api/admin/upload/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { r2 } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";

function requireEnv(name: string) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env var: ${name}`);
    return v;
}

export async function POST(req: Request) {
    const session = await auth();
    const email = session?.user?.email?.toLowerCase().trim();
    const owner = (process.env.OWNER_EMAIL || "").toLowerCase().trim();

    if (!email || !owner || email !== owner) {
        return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const bucket = requireEnv("R2_BUCKET");

    const form = await req.formData();
    const title = String(form.get("title") || "").trim();
    const file = form.get("file") as File | null;

    if (!title) {
        return Response.json({ ok: false, error: "Title is required." }, { status: 400 });
    }
    if (!file) {
        return Response.json({ ok: false, error: "File is required." }, { status: 400 });
    }

    const contentType = file.type || "application/octet-stream";
    if (contentType !== "application/pdf") {
        return Response.json({ ok: false, error: "Only PDFs are supported for now." }, { status: 400 });
    }

    // NOTE: This reads the whole file into memory. Fine for typical PDFs.
    // If you expect very large uploads, we can switch to streaming + signed upload URLs.
    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);

    // Create an R2 key
    const safeName = (file.name || "upload.pdf").replace(/[^\w.\-]+/g, "_");
    const key = `docs/${Date.now()}_${safeName}`;

    await r2.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buf,
            ContentType: contentType,
        })
    );

    // Insert metadata in DB
    // Neon `sql` can be used as tagged template or function depending on your db helper.
    // This version uses a simple SQL string call.
    const insert = await sql(
        `
    insert into documents (title, filename, content_type, bytes, r2_bucket, r2_key, created_by_email)
    values ($1, $2, $3, $4, $5, $6, $7)
    returning id::text as id, created_at
    `,
        [title, safeName, contentType, String(buf.length), bucket, key, email]
    );

    const row = (insert as any)[0] || (insert as any).rows?.[0];
    const id = row?.id;

    return Response.json({
        ok: true,
        doc: {
            id,
            title,
            filename: safeName,
            bytes: buf.length,
            content_type: contentType,
            created_at: row?.created_at,
        },
    });
}

