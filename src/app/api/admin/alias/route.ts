import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { sql } from "@/lib/db";

function cleanAlias(input: string) {
    const a = input.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(a)) {
        throw new Error(
            "Alias must be 3–64 chars: letters, numbers, _ or -, starting with a letter/number."
        );
    }
    return a;
}

export async function POST(req: Request) {
    try {
        const session = await auth();
        const email = session?.user?.email;
        if (!email) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json().catch(() => null);
        const docId = String(body?.docId || "").trim();
        const aliasRaw = String(body?.alias || "");

        if (!docId) {
            return NextResponse.json({ ok: false, error: "Missing docId" }, { status: 400 });
        }
        const alias = cleanAlias(aliasRaw);

        // ensure doc exists
        const docCheck = await sql<{ id: string }[]>`
      select id::text as id
      from docs
      where id = ${docId}::uuid
    `;
        if (docCheck.length === 0) {
            return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
        }

        // if alias exists for a different doc, block it (optional safety)
        const existing = await sql<{ alias: string; doc_id: string }[]>`
      select alias, doc_id::text as doc_id
      from doc_aliases
      where alias = ${alias}
    `;
        if (existing.length > 0 && existing[0].doc_id !== docId) {
            return NextResponse.json(
                { ok: false, error: "Alias already in use for another document" },
                { status: 409 }
            );
        }

        // upsert alias -> doc_id
        await sql`
      insert into doc_aliases (alias, doc_id, created_by_email)
      values (${alias}, ${docId}::uuid, ${email})
      on conflict (alias) do update
        set doc_id = excluded.doc_id
    `;

        return NextResponse.json({ ok: true, alias, url: `/d/${alias}` });
    } catch (e: any) {
        return NextResponse.json(
            { ok: false, error: e?.message || "Unknown error" },
            { status: 500 }
        );
    }
}
