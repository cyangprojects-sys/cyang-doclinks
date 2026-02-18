// src/app/d/[alias]/raw/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { r2Client } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { resolveDoc } from "@/lib/resolveDoc";
import { sql } from "@/lib/db";
import { aliasTrustCookieName, isAliasTrusted } from "@/lib/deviceTrust";

function normAlias(alias: string): string {
  return decodeURIComponent(String(alias || "")).trim().toLowerCase();
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  return Number.isFinite(t) && t <= Date.now();
}

async function getAliasRow(aliasInput: string): Promise<
  | { ok: true; docId: string; revokedAt: string | null; expiresAt: string | null; passwordHash: string | null }
  | { ok: false }
> {
  const alias = normAlias(aliasInput);
  if (!alias) return { ok: false };

  // Preferred: doc_aliases
  try {
    const rows = (await sql`
      select
        a.doc_id::text as doc_id,
        a.revoked_at::text as revoked_at,
        a.expires_at::text as expires_at,
        a.password_hash::text as password_hash
      from public.doc_aliases a
      where lower(a.alias) = ${alias}
        and coalesce(a.is_active, true) = true
      limit 1
    `) as unknown as Array<{
      doc_id: string;
      revoked_at: string | null;
      expires_at: string | null;
      password_hash: string | null;
    }>;

    if (rows?.length) {
      const r = rows[0];
      return {
        ok: true,
        docId: r.doc_id,
        revokedAt: r.revoked_at ?? null,
        expiresAt: r.expires_at ?? null,
        passwordHash: r.password_hash ?? null,
      };
    }
  } catch {
    // fall through
  }

  // Legacy: document_aliases
  try {
    const rows = (await sql`
      select
        a.doc_id::text as doc_id,
        null::text as revoked_at,
        a.expires_at::text as expires_at,
        a.password_hash::text as password_hash
      from public.document_aliases a
      where lower(a.alias) = ${alias}
      limit 1
    `) as unknown as Array<{
      doc_id: string;
      revoked_at: string | null;
      expires_at: string | null;
      password_hash: string | null;
    }>;

    if (rows?.length) {
      const r = rows[0];
      return {
        ok: true,
        docId: r.doc_id,
        revokedAt: r.revoked_at ?? null,
        expiresAt: r.expires_at ?? null,
        passwordHash: r.password_hash ?? null,
      };
    }
  } catch {
    // ignore
  }

  return { ok: false };
}

function pickFilename(title: string | null, original: string | null, fallback: string) {
  const base = (title || original || fallback).trim() || fallback;
  return base.replace(/[^\w.\- ]+/g, "_");
}

function isNoSuchKey(err: any) {
  const name = String(err?.name || "");
  const code = String(err?.Code || err?.code || "");
  const message = String(err?.message || "");
  return (
    name === "NoSuchKey" ||
    code === "NoSuchKey" ||
    message.toLowerCase().includes("nosuchkey")
  );
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ alias: string }> }
): Promise<Response> {
  try {
    const { alias: rawAlias } = await ctx.params;
    const alias = normAlias(rawAlias || "");

    if (!alias) return new Response("Missing alias", { status: 400 });

    // Resolve alias row ourselves so we can enforce the device-trust cookie.
    const row = await getAliasRow(alias);
    if (!row.ok) return new Response("Not found", { status: 404 });
    if (row.revokedAt) return new Response("Not found", { status: 404 });
    if (isExpired(row.expiresAt)) return new Response("Not found", { status: 404 });

    if (row.passwordHash) {
      const v = req.cookies.get(aliasTrustCookieName(alias))?.value;
      const unlocked = isAliasTrusted(alias, v);
      if (!unlocked) {
        return new Response(null, {
          status: 302,
          headers: { Location: `/d/${encodeURIComponent(alias)}` },
        });
      }
    }

    const resolved = await resolveDoc({ docId: row.docId });
    if (!resolved.ok) return new Response("Not found", { status: 404 });

    if (!resolved.bucket || !resolved.r2Key) {
      return new Response("Not found", { status: 404 });
    }

    let obj;
    try {
      obj = await r2Client.send(
        new GetObjectCommand({
          Bucket: resolved.bucket,
          Key: resolved.r2Key,
        })
      );
    } catch (e: any) {
      if (isNoSuchKey(e)) return new Response("Not found", { status: 404 });
      console.error("R2 GetObject error:", e);
      return new Response("Internal server error", { status: 500 });
    }

    if (!obj?.Body) return new Response("Object body missing", { status: 500 });

    const filename = pickFilename(resolved.title, resolved.originalFilename, alias) + ".pdf";
    const contentType = resolved.contentType || "application/pdf";

    return new Response(obj.Body as any, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (err: any) {
    console.error("RAW ROUTE ERROR:", err);
    return new Response("Internal server error", { status: 500 });
  }
}
