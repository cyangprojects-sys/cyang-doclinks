import { NextRequest, NextResponse } from "next/server";
import { resolveShareMeta } from "@/lib/resolveDoc";
import { sql } from "@/lib/db";
import { isMicrosoftOfficeDocument } from "@/lib/fileFamily";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

function isMaxed(viewCount: number, maxViews: number | null) {
  if (maxViews === null || maxViews === 0) return false;
  return viewCount >= maxViews;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const t = (token || "").trim();
  if (!t) return new NextResponse("Not found", { status: 404 });

  const meta = await resolveShareMeta(t);
  if (!meta.ok) return new NextResponse("Not found", { status: 404 });
  if (meta.revokedAt) return new NextResponse("Revoked", { status: 410 });
  if (isExpired(meta.expiresAt)) return new NextResponse("Link expired", { status: 410 });
  if (isMaxed(meta.viewCount ?? 0, meta.maxViews)) return new NextResponse("Max views reached", { status: 410 });
  const rows = (await sql`
    select
      coalesce(content_type::text, '') as content_type,
      coalesce(original_filename::text, '') as original_filename
    from public.docs
    where id = ${meta.docId}::uuid
    limit 1
  `) as unknown as Array<{ content_type: string; original_filename: string }>;
  const isMicrosoftOffice = isMicrosoftOfficeDocument({
    contentType: rows?.[0]?.content_type || null,
    filename: rows?.[0]?.original_filename || null,
  });
  if (meta.allowDownload === false && !isMicrosoftOffice) {
    return new NextResponse("Download is disabled for this shared document.", { status: 403 });
  }

  const url = new URL(`/s/${encodeURIComponent(t)}/raw`, req.url);
  url.searchParams.set("disposition", "attachment");
  return NextResponse.redirect(url, { status: 302 });
}
