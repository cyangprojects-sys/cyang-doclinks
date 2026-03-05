import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { convertOfficeBytes } from "@/lib/officePreview";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";
import { resolvePublicAppBaseUrl } from "@/lib/publicBaseUrl";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  rawPath: z.string().min(1),
  mimeType: z.string().min(1),
});
const MAX_VIEWER_OFFICE_BODY_BYTES = 8 * 1024;
const MAX_RAW_PATH_LEN = 256;
const MAX_MIME_LEN = 160;
const OFFICE_PREVIEW_FETCH_TIMEOUT_MS = getRouteTimeoutMs("VIEWER_OFFICE_FETCH_TIMEOUT_MS", 15_000);

function isAllowedRawPath(pathname: string): boolean {
  const p = String(pathname || "");
  return /^\/s\/[^/]+\/raw$/i.test(p) || /^\/d\/[^/]+\/raw$/i.test(p);
}

function isSupportedOfficeMime(rawMime: string): boolean {
  const mime = String(rawMime || "").toLowerCase().split(";", 1)[0].trim();
  return [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
  ].includes(mime);
}

function parseJsonBodyLength(req: NextRequest): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const out = Number(raw);
  return Number.isFinite(out) ? Math.max(0, Math.floor(out)) : 0;
}

export async function POST(req: NextRequest) {
  try {
    const rl = await enforceGlobalApiRateLimit({
      req,
      scope: "ip:viewer_office_preview",
      limit: Number(process.env.RATE_LIMIT_VIEWER_OFFICE_PREVIEW_IP_PER_MIN || 20),
      windowSeconds: 60,
      strict: true,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: "RATE_LIMIT", message: "Too many preview attempts. Try again shortly." },
        { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }
    if (parseJsonBodyLength(req) > MAX_VIEWER_OFFICE_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
    }

    const body = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
    }

    const rawPath = parsed.data.rawPath.trim();
    const mimeType = parsed.data.mimeType.trim().toLowerCase();
    if (!rawPath || rawPath.length > MAX_RAW_PATH_LEN || /[\r\n\0]/.test(rawPath)) {
      return NextResponse.json({ ok: false, error: "BAD_PATH" }, { status: 400 });
    }
    if (!mimeType || mimeType.length > MAX_MIME_LEN || /[\r\n\0]/.test(mimeType)) {
      return NextResponse.json({ ok: false, error: "BAD_MIME" }, { status: 400 });
    }
    if (!isSupportedOfficeMime(mimeType)) {
      return NextResponse.json({ ok: false, error: "BAD_MIME" }, { status: 400 });
    }
    if (!isAllowedRawPath(rawPath)) {
      return NextResponse.json({ ok: false, error: "BAD_PATH" }, { status: 400 });
    }

    let appBaseUrl: string;
    try {
      appBaseUrl = resolvePublicAppBaseUrl(req.url);
    } catch {
      return NextResponse.json({ ok: false, error: "ENV_MISCONFIGURED" }, { status: 500 });
    }

    const src = new URL(rawPath, appBaseUrl);
    const upstream = await withRouteTimeout(
      fetch(src.toString(), {
        method: "GET",
        cache: "no-store",
        headers: {
          cookie: req.headers.get("cookie") || "",
          accept: `${mimeType},*/*`,
        },
      }),
      OFFICE_PREVIEW_FETCH_TIMEOUT_MS
    );
    if (src.origin !== new URL(appBaseUrl).origin || !isAllowedRawPath(src.pathname)) {
      return NextResponse.json({ ok: false, error: "BAD_PATH" }, { status: 400 });
    }

    if (!upstream.ok) {
      return NextResponse.json(
        { ok: false, error: "SOURCE_UNAVAILABLE", message: "Source unavailable." },
        { status: 409 }
      );
    }

    const ab = await withRouteTimeout(upstream.arrayBuffer(), OFFICE_PREVIEW_FETCH_TIMEOUT_MS);
    const bytes = Buffer.from(ab);
    const absMax = Number(process.env.UPLOAD_ABSOLUTE_MAX_BYTES || 104_857_600);
    if (Number.isFinite(absMax) && absMax > 0 && bytes.length > absMax) {
      return NextResponse.json(
        { ok: false, error: "TOO_LARGE", message: "File too large for inline conversion." },
        { status: 413 }
      );
    }

    const out = await withRouteTimeout(convertOfficeBytes({ bytes, mimeType }), OFFICE_PREVIEW_FETCH_TIMEOUT_MS);
    if (!out.ok) {
      return NextResponse.json({ ok: false, error: out.error, message: out.message }, { status: 409 });
    }

    return NextResponse.json({ ok: true, html: out.html });
  } catch (e: unknown) {
    if (isRouteTimeoutError(e)) {
      return NextResponse.json({ ok: false, error: "TIMEOUT" }, { status: 504 });
    }
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
