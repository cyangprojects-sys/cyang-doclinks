import { NextRequest, NextResponse } from "next/server";
import { resolveShareMeta } from "@/lib/resolveDoc";

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
  if (meta.allowDownload === false) return new NextResponse("Download is disabled for this shared document.", { status: 403 });

  const url = new URL(`/s/${encodeURIComponent(t)}/raw`, req.url);
  url.searchParams.set("disposition", "attachment");
  return NextResponse.redirect(url, { status: 302 });
}
