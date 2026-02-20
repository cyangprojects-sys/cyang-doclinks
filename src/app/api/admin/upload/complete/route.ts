export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { requireDocWrite } from "@/lib/authz";

type CompleteRequest = {
  // Newer flow: doc_id from /presign response
  doc_id?: string;

  // Older flow (what your Network screenshot shows right now)
  r2_bucket?: string;
  r2_key?: string;

  title?: string | null;
  original_filename?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CompleteRequest;

    const title = body.title ?? null;
    const originalFilename = body.original_filename ?? null;

    // 1) Resolve docId either directly or via (bucket,key)
    let docId: string | null = body.doc_id ?? null;

    if (!docId) {
      const bucket = body.r2_bucket ?? null;
      const key = body.r2_key ?? null;

      if (bucket && key) {
        const rows = (await sql`
          select id::text as id
          from public.docs
          where r2_bucket = ${bucket}
            and r2_key = ${key}
          limit 1
        `) as { id: string }[];

        docId = rows?.[0]?.id ?? null;
      }
    }

    // AuthZ: must be able to manage this doc.
    await requireDocWrite(docId);

    if (!docId) {
      return NextResponse.json(
        { ok: false, error: "Missing docId" },
        { status: 400 }
      );
    }

    // AuthZ: must be able to manage this doc.
    await requireDocWrite(docId);
  }

    // 2) Fetch existing doc (for slug fallback)
    const docRows = (await sql`
      select
        id::text as id,
        coalesce(original_filename, title, '')::text as name,
        r2_bucket::text as r2_bucket,
        r2_key::text as r2_key
      from public.docs
      where id = ${docId}::uuid
      limit 1
    `) as { id: string; name: string; r2_bucket: string | null; r2_key: string | null }[];

  if (!docRows.length) {
    return NextResponse.json({ ok: false, error: "doc_not_found" }, { status: 404 });
  }

  const existingName = docRows[0].name;

  // 3) Mark doc ready + update metadata (best-effort)
  await sql`
      update public.docs
      set
        title = coalesce(${title}, title),
        original_filename = coalesce(${originalFilename}, original_filename),
        status = 'ready'
      where id = ${docId}::uuid
    `;

  // 4) Generate alias base
  let base = slugify(title || originalFilename || existingName || "document");
  if (!base) base = `doc-${docId.slice(0, 8)}`;

  // 5) Create alias with collision handling
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
      // alias collision, try next
    }
  }

  if (!finalAlias) {
    return NextResponse.json({ ok: false, error: "alias_generation_failed" }, { status: 500 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  return NextResponse.json({
    ok: true,
    doc_id: docId,
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
