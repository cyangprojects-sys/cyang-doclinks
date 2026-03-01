import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { convertOfficeBytes } from "@/lib/officePreview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  rawPath: z.string().min(1),
  mimeType: z.string().min(1),
});

function isAllowedRawPath(pathname: string): boolean {
  const p = String(pathname || "");
  return /^\/s\/[^/]+\/raw$/i.test(p) || /^\/d\/[^/]+\/raw$/i.test(p);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
    }

    const rawPath = parsed.data.rawPath.trim();
    const mimeType = parsed.data.mimeType.trim().toLowerCase();
    if (!isAllowedRawPath(rawPath)) {
      return NextResponse.json({ ok: false, error: "BAD_PATH" }, { status: 400 });
    }

    const src = new URL(rawPath, req.nextUrl.origin);
    const upstream = await fetch(src.toString(), {
      method: "GET",
      cache: "no-store",
      headers: {
        cookie: req.headers.get("cookie") || "",
        accept: `${mimeType},*/*`,
      },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { ok: false, error: "SOURCE_UNAVAILABLE", message: `Source unavailable (${upstream.status}).` },
        { status: 409 }
      );
    }

    const ab = await upstream.arrayBuffer();
    const bytes = Buffer.from(ab);
    const absMax = Number(process.env.UPLOAD_ABSOLUTE_MAX_BYTES || 104_857_600);
    if (Number.isFinite(absMax) && absMax > 0 && bytes.length > absMax) {
      return NextResponse.json(
        { ok: false, error: "TOO_LARGE", message: "File too large for inline conversion." },
        { status: 413 }
      );
    }

    const out = await convertOfficeBytes({ bytes, mimeType });
    if (!out.ok) {
      return NextResponse.json({ ok: false, error: out.error, message: out.message }, { status: 409 });
    }

    return NextResponse.json({ ok: true, html: out.html });
  } catch {
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
