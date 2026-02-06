export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  header.split(";").forEach((part) => {
    const [k, ...rest] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(rest.join("=") || "");
  });
  return out;
}

export async function GET(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const jar = parseCookieHeader(cookieHeader);

  return Response.json({
    cookieHeaderLen: cookieHeader.length,
    cookieNames: Object.keys(jar),
    hasCyDocSession: Boolean(jar["cy_doc_session"]),
    cyDocSessionPreview: jar["cy_doc_session"]?.slice(0, 40) + "..." || null,
  });
}
