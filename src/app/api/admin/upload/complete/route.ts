export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { slugify } from "@/lib/slug";

type CompleteRequest = {
    doc_id: string;
    title?: string;
    original_filename?: string;
};

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as CompleteRequest;

        const docId = body.doc_id;
        const title = body.title || null;
        const originalFilename = body.original_filename || null;

        if (!docId) {
            return NextResponse.json(
                { ok: false, error: "missing_doc_id" },
                { status: 400 }
            );
        }

        // 1️⃣ Ensure document exists
        const docRows = (await sql`
      select id::text as id
      from public.docs
      where id = ${docId}::uuid
      limit 1
    `) as { id: string }[];

        if (!docRows.length) {
            return NextResponse.json(
                { ok: false, error: "doc_not_found" },
                { status: 404 }
            );
        }

        // 2️⃣ Update title if provided
        if (title) {
            await sql`
        update public.docs
        set title = ${title}
        where id = ${docId}::uuid
      `;
        }

        // 3️⃣ Generate base alias
        let base = slugify(title || originalFilename || "document");

        if (!base) {
            base = `doc-${docId.slice(0, 8)}`;
        }

        // 4️⃣ Try base, then base-2, base-3...
        let finalAlias: string | null = null;

        for (let i = 0; i < 50; i++) {
            const candidateAlias = i === 0 ? base : `${base}-${i + 1}`;

            try {
                await sql`
          insert into public.doc_aliases (alias, doc_id)
          values (${candidateAlias}, ${docId}::uuid)
        `;

                finalAlias = candidateAlias;
                break;
            } catch {
                // collision → try next
            }
        }

        if (!finalAlias) {
            return NextResponse.json(
                { ok: false, error: "alias_generation_failed" },
                { status: 500 }
            );
        }

        const baseUrl =
            process.env.NEXT_PUBLIC_SITE_URL ||
            (process.env.VERCEL_URL
                ? `https://${process.env.VERCEL_URL}`
                : "http://localhost:3000");

        return NextResponse.json({
            ok: true,
            alias: finalAlias,
            view_url: `${baseUrl}/d/${encodeURIComponent(finalAlias)}`,
        });
    } catch (e: any) {
        return NextResponse.json(
            { ok: false, error: "server_error", message: e?.message || "Unknown error" },
            { status: 500 }
        );
    }
}
