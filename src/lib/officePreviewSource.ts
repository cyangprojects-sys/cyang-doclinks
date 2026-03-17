import { NextRequest } from "next/server";
import { GET as getAliasRaw } from "@/app/d/[alias]/raw/route";
import { GET as getShareRaw } from "@/app/s/[token]/raw/route";
import { GET as getTicket } from "@/app/t/[ticketId]/route";

type RawSourceKind =
  | { kind: "share"; token: string }
  | { kind: "alias"; alias: string };

type PreviewSourceResponse =
  | { ok: true; bytes: Buffer; contentType: string | null }
  | { ok: false; status: number; location?: string | null };

function copyRequestHeaders(req: Request, mimeType: string): Headers {
  const headers = new Headers();
  const allowlist = [
    "cookie",
    "user-agent",
    "accept-language",
    "referer",
    "x-forwarded-for",
    "x-real-ip",
    "cf-connecting-ip",
  ];

  for (const key of allowlist) {
    const value = req.headers.get(key);
    if (value) headers.set(key, value);
  }
  headers.set("accept", `${mimeType},*/*`);
  return headers;
}

export function resolveOfficePreviewRawSource(pathname: string): RawSourceKind | null {
  const normalized = String(pathname || "").trim();
  const shareMatch = normalized.match(/^\/s\/([^/]+)\/raw$/i);
  if (shareMatch?.[1]) {
    return { kind: "share", token: shareMatch[1] };
  }

  const aliasMatch = normalized.match(/^\/d\/([^/]+)\/raw$/i);
  if (aliasMatch?.[1]) {
    return { kind: "alias", alias: aliasMatch[1] };
  }

  return null;
}

function buildNextRequest(url: string, req: Request, mimeType: string): NextRequest {
  return new NextRequest(
    new Request(url, {
      method: "GET",
      headers: copyRequestHeaders(req, mimeType),
    })
  );
}

async function followTicketRedirect(
  req: Request,
  mimeType: string,
  location: string
): Promise<PreviewSourceResponse> {
  const url = new URL(location, req.url);
  const match = url.pathname.match(/^\/t\/([^/]+)$/i);
  if (!match?.[1]) {
    return { ok: false, status: 409, location };
  }

  const ticketResponse = await getTicket(buildNextRequest(url.toString(), req, mimeType), {
    params: Promise.resolve({ ticketId: match[1] }),
  });

  if (!ticketResponse.ok) {
    return {
      ok: false,
      status: ticketResponse.status,
      location,
    };
  }

  const bytes = Buffer.from(await ticketResponse.arrayBuffer());
  return {
    ok: true,
    bytes,
    contentType: ticketResponse.headers.get("content-type"),
  };
}

export async function readOfficePreviewSource(args: {
  req: Request;
  rawPath: string;
  mimeType: string;
}): Promise<PreviewSourceResponse> {
  const source = resolveOfficePreviewRawSource(args.rawPath);
  if (!source) {
    return { ok: false, status: 400 };
  }

  const sourceUrl = new URL(args.rawPath, args.req.url);
  const request = buildNextRequest(sourceUrl.toString(), args.req, args.mimeType);
  const rawResponse =
    source.kind === "share"
      ? await getShareRaw(request, { params: Promise.resolve({ token: source.token }) })
      : await getAliasRaw(request, { params: Promise.resolve({ alias: source.alias }) });

  if (rawResponse.status >= 300 && rawResponse.status < 400) {
    const location = rawResponse.headers.get("location");
    if (!location) {
      return { ok: false, status: rawResponse.status };
    }
    return followTicketRedirect(args.req, args.mimeType, location);
  }

  if (!rawResponse.ok) {
    return { ok: false, status: rawResponse.status };
  }

  const bytes = Buffer.from(await rawResponse.arrayBuffer());
  return {
    ok: true,
    bytes,
    contentType: rawResponse.headers.get("content-type"),
  };
}
