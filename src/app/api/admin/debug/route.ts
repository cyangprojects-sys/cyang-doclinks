export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/authz";

import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { getR2Bucket, r2Client } from "@/lib/r2";

type AliasRow = {
  alias: string;
  doc_id: string;
  revoked_at: string | null;
  expires_at: string | null;
  created_at?: string | null;
};

function boolEnv(name: string) {
  return Boolean(process.env[name] && String(process.env[name]).trim().length > 0);
}

async function tableExists(regclass: string) {
  const rows = (await sql`
    select to_regclass(${regclass})::text as reg
  `) as { reg: string | null }[];
  return Boolean(rows?.[0]?.reg);
}

export async function GET(req: NextRequest) {
  try {
    const r2Bucket = getR2Bucket();
    const enabled =
      process.env.NODE_ENV !== "production" ||
      ["1", "true", "yes", "on"].includes(String(process.env.ADMIN_DEBUG_ENABLED || "").trim().toLowerCase());
    if (!enabled) {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }

    await requireRole("owner");

    const url = new URL(req.url);
    const alias = (url.searchParams.get("alias") || "").trim();
    if (!alias) return NextResponse.json({ ok: false, error: "MISSING_ALIAS" }, { status: 400 });

    // Detect what tables exist (helps catch schema drift between old "documents" and new "docs")
    const [hasDocs, hasDocuments, hasDocAliases, hasDocViews] = await Promise.all([
      tableExists("public.docs"),
      tableExists("public.documents"),
      tableExists("public.doc_aliases"),
      tableExists("public.doc_views"),
    ]);

    const notes: string[] = [];
    if (hasDocuments && hasDocs) {
      notes.push("Both public.docs and public.documents exist. Make sure your /serve route reads from the same table your uploader writes to.");
    } else if (hasDocuments && !hasDocs) {
      notes.push("public.docs does NOT exist but public.documents does. Your newer upload routes (presign/complete) look like they write to public.docs.");
    } else if (hasDocs && !hasDocuments) {
      notes.push("public.documents does NOT exist but public.docs does. If /serve is still querying public.documents, it will return Not Found.");
    } else {
      notes.push("Neither public.docs nor public.documents exists (unexpected). Check your DB connection / migrations.");
    }

    if (!hasDocAliases) {
      notes.push("public.doc_aliases does NOT exist. /d/[alias] cannot resolve anything without it.");
    }

    // Read alias row (always from public.doc_aliases, when present)
    let aliasRow: AliasRow | null = null;
    if (hasDocAliases) {
      const rows = (await sql`
        select
          alias,
          doc_id::text as doc_id,
          revoked_at,
          expires_at,
          created_at
        from public.doc_aliases
        where alias = ${alias}
        order by created_at desc
        limit 1
      `) as AliasRow[];

      aliasRow = rows?.[0] ?? null;

      if (!aliasRow) {
        notes.push("Alias row NOT found in public.doc_aliases for this alias.");
      } else {
        if (aliasRow.revoked_at) notes.push("Alias is revoked (revoked_at is set).");
        if (aliasRow.expires_at) notes.push("Alias has an expires_at value; if it's in the past it will be treated as expired.");
      }
    }

    // Read document row from whichever table exists
    const docId = aliasRow?.doc_id ?? null;
    let docRow: any = null;

    if (docId) {
      if (hasDocs) {
        const rows = await sql`
          select
            id::text as id,
            title,
            original_filename,
            content_type,
            size_bytes,
            r2_bucket,
            r2_key,
            created_by_email,
            status,
            created_at
          from public.docs
          where id = ${docId}::uuid
          limit 1
        `;
        docRow = (rows as any[])?.[0] ?? null;
        if (!docRow) notes.push("No row found in public.docs for doc_id (alias points to missing doc).");
      } else if (hasDocuments) {
        const rows = await sql`
          select
            id::text as id,
            title,
            target_url,
            created_at
          from public.documents
          where id = ${docId}::uuid
          limit 1
        `;
        docRow = (rows as any[])?.[0] ?? null;
        if (!docRow) notes.push("No row found in public.documents for doc_id (alias points to missing doc).");
      }
    }

    // Best-effort R2 HEAD (only if we have a bucket/key)
    let r2Head: any = null;
    if (docRow?.r2_key) {
      try {
        const bucket = docRow?.r2_bucket || r2Bucket;
        const head = await r2Client.send(
          new HeadObjectCommand({
            Bucket: bucket,
            Key: docRow.r2_key,
          })
        );
        r2Head = {
          ok: true,
          bucket,
          key: docRow.r2_key,
          contentLength: head.ContentLength ?? null,
          contentType: head.ContentType ?? null,
          etag: head.ETag ?? null,
          lastModified: head.LastModified ? new Date(head.LastModified).toISOString() : null,
        };
      } catch (e: any) {
        r2Head = { ok: false, error: e?.name ?? "HEAD_FAILED", message: "Object HEAD failed" };
        notes.push("R2 HEAD failed (bucket/key may be wrong, or credentials missing).");
      }
    } else if (docRow && hasDocs) {
      notes.push("Doc row exists in public.docs but r2_key is empty/null (serve cannot fetch from R2).");
    }

    const env = {
      NEXT_PUBLIC_SITE_URL: boolEnv("NEXT_PUBLIC_SITE_URL"),
      DATABASE_URL: boolEnv("DATABASE_URL"),
      OWNER_EMAIL: boolEnv("OWNER_EMAIL"),
      AUTH_SECRET: boolEnv("AUTH_SECRET"),
      GOOGLE_CLIENT_ID: boolEnv("GOOGLE_CLIENT_ID"),
      GOOGLE_CLIENT_SECRET: boolEnv("GOOGLE_CLIENT_SECRET"),
      R2_ACCOUNT_ID: boolEnv("R2_ACCOUNT_ID"),
      R2_ACCESS_KEY_ID: boolEnv("R2_ACCESS_KEY_ID"),
      R2_SECRET_ACCESS_KEY: boolEnv("R2_SECRET_ACCESS_KEY"),
      R2_BUCKET: boolEnv("R2_BUCKET"),
      R2_PREFIX: boolEnv("R2_PREFIX"),
      VIEW_SALT: boolEnv("VIEW_SALT"),
    };

    return NextResponse.json({
      ok: true,
      now: new Date().toISOString(),
      alias,
      tables: {
        "public.docs": hasDocs,
        "public.documents": hasDocuments,
        "public.doc_aliases": hasDocAliases,
        "public.doc_views": hasDocViews,
      },
      env,
      alias_row: aliasRow,
      doc_row: docRow,
      r2_head: r2Head,
      notes,
    });
  } catch (err: any) {
    console.error("ADMIN DEBUG ERROR:", err);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR", message: "Debug inspection failed." }, { status: 500 });
  }
}
