// src/app/api/admin/upload/complete/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { r2Client } from "@/lib/r2";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { createUniqueAliasForDoc } from "@/lib/alias";

type Body = {
    title?: string;
    original_filename?: string;

    // NOTE: your presign returns `bucket` + `r2_key`
    r2_bucket: string;
    r2_key: string;

    // optional if you want to keep it
    created_by_email?: string; // not used by schema
};

export async function POST(req: NextRequest) {
    const origin = process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin;

    let body: Body;
    try {
        body = (await req.json()) as Body;
    } catch {
        return new Response("Bad JSON", { status: 400 });
    }

    if (!body?.r2_bucket || !body?.r2_key) {
        return new Response("Missing r2_bucket or r2_key", { status: 400 });
    }

    const title =
        (body.title || "").trim() ||
        (body.original_filename || "").trim() ||
        "Document";

    const originalFilename = (body.original_filename || "").trim() || null;

    // 1) Ensure the object exists in R2
    try {
        await r2Client.send(
            new HeadObjectCommand({
                Bucket: body.r2_bucket,
                Key: body.r2_key,
            })
        );
    } catch {
        return new Response("Uploaded object not found in R2", { status: 400 });
    }

    // 2) Store pointer in documents.target_url (your schema)
    const targetUrl = `r2://${body.r2_bucket}/${body.r2_key}`;

    const docRows = (await sql`
    insert into documents (title, target_url, original_filename)
    values (${title}, ${targetUrl}, ${originalFilename})
    returning id::text as id
  `) as { id: string }[];

    const docId = docRows?.[0]?.id;
    if (!docId) return new Response("Failed to create document", { status: 500 });

    // 3) Create friendly alias
    const alias = await createUniqueAliasForDoc({
        docId,
        base: title || originalFilename || "document",
    });

    return Response.json({
        ok: true,
        doc_id: docId,
        alias,
        view_url: `${origin}/d/${encodeURIComponent(alias)}`,
        target_url: targetUrl,
    });
}
