// src/app/api/admin/alias/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { sql } from "@/lib/db";

function cleanAlias(input: string) {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

export async function POST(req: Request) {
    const session = await auth();
    const email = session?.user?.email?.toLowerCase().trim();
    const owner = (process.env.OWNER_EMAIL || "").toLowerCase().trim();

    if (!email || !owner || email !== owner) {
        return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const docId = String(body?.docId || "").trim();
    const aliasRaw = String(body?.alias || "").trim();

    if (!docId) return Response.json({ ok: false, error: "docId is required" }, { status: 400 });

    const alias = cleanAlias(aliasRaw);
    if (!alias) return Response.json({ ok: false, error: "alias is required" }, { status: 400 });

    // upsert alias -> doc_id
    await sql(
        `
    insert into doc_aliases (alias, doc_id)
    values ($1, $2::uuid)
    on conflict (alias) do update set doc_id = excluded.doc_id
    `,
        [alias, docId]
    );

    return Response.json({
        ok: true,
        alias,
        link: `/d/${alias}`,
    });
}

