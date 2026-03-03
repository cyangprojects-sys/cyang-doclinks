export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/authz";
import { isDebugApiEnabled } from "@/lib/debugAccess";

import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { getR2Bucket, r2Client } from "@/lib/r2";

type AliasRow = {
  alias: string;
  doc_id: string;
  revoked_at: string | null;
  expires_at: string | null;
  created_at?: string | null;
};

function isExpiredAt(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const ts = Date.parse(raw);
  return Number.isFinite(ts) && ts <= Date.now();
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
    if (!isDebugApiEnabled()) {
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
      notes.push("Multiple document tables detected.");
    } else if (hasDocuments && !hasDocs) {
      notes.push("Legacy documents table detected without docs table.");
    } else if (hasDocs && !hasDocuments) {
      notes.push("Primary docs table detected.");
    } else {
      notes.push("No expected document table found.");
    }

    if (!hasDocAliases) {
      notes.push("Alias table missing.");
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
        notes.push("Alias row not found.");
      } else {
        if (aliasRow.revoked_at) notes.push("Alias is revoked.");
        if (isExpiredAt(aliasRow.expires_at)) notes.push("Alias is expired.");
      }
    }

    // Read document row from whichever table exists
    const docId = aliasRow?.doc_id ?? null;
    let docRow: Record<string, unknown> | null = null;

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
            status,
            created_at
          from public.docs
          where id = ${docId}::uuid
          limit 1
        `;
        docRow = (rows as Array<Record<string, unknown>>)?.[0] ?? null;
        if (!docRow) notes.push("Document row missing in docs table.");
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
        docRow = (rows as Array<Record<string, unknown>>)?.[0] ?? null;
        if (!docRow) notes.push("Document row missing in legacy table.");
      }
    }

    // Best-effort R2 HEAD (only if we have a bucket/key)
    let r2Head: Record<string, unknown> | null = null;
    const docBucketVal = typeof docRow?.r2_bucket === "string" ? docRow.r2_bucket : null;
    const docKeyVal = typeof docRow?.r2_key === "string" ? docRow.r2_key : null;
    if (docKeyVal) {
      try {
        const bucket = docBucketVal || r2Bucket;
        const head = await r2Client.send(
          new HeadObjectCommand({
            Bucket: bucket,
            Key: docKeyVal,
          })
        );
        r2Head = {
          ok: true,
          object_present: true,
          contentLength: head.ContentLength ?? null,
          contentType: head.ContentType ?? null,
          etag: head.ETag ?? null,
          lastModified: head.LastModified ? new Date(head.LastModified).toISOString() : null,
        };
      } catch (e: unknown) {
        const err = e as { name?: string };
        r2Head = { ok: false, object_present: false, error: err?.name ?? "HEAD_FAILED" };
        notes.push("Object storage HEAD check failed.");
      }
    } else if (docRow && hasDocs) {
      notes.push("Document row missing object key.");
    }

    const aliasStatus = aliasRow
      ? {
          exists: true,
          revoked: Boolean(aliasRow.revoked_at),
          expired: isExpiredAt(aliasRow.expires_at),
          created_at: aliasRow.created_at ?? null,
        }
      : { exists: false, revoked: false, expired: false, created_at: null };

    const documentStatus = {
      exists: Boolean(docRow),
      status: typeof docRow?.status === "string" ? docRow.status : null,
      content_type: typeof docRow?.content_type === "string" ? docRow.content_type : null,
      size_bytes: typeof docRow?.size_bytes === "number" ? docRow.size_bytes : null,
      has_object_key: Boolean(docKeyVal),
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
      alias_status: aliasStatus,
      document_status: documentStatus,
      storage_status: r2Head,
      notes,
    });
  } catch (err: unknown) {
    void err;
    console.warn("ADMIN DEBUG ERROR");
    return NextResponse.json({ ok: false, error: "SERVER_ERROR", message: "Debug inspection failed." }, { status: 500 });
  }
}
