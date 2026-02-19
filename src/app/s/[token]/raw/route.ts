// src/app/s/[token]/raw/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getObjectStream } from "@/lib/r2";
import { sha256Hex } from "@/lib/crypto";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * If someone PASTES /raw into the address bar, the browser navigation sends
 * Accept: text/html and we should redirect them to /s/<token> so they hit the
 * gate UI (email/password) instead of getting a PDF endpoint directly.
 *
 * But when the embedded PDF viewer fetches the PDF, Accept is usually
 * application/pdf or * / * (not text/html), so we keep serving the PDF normally.
 */
function shouldRedirectToGate(req: NextRequest): boolean {
  const accept = (req.headers.get("accept") || "").toLowerCase();
  // If HTML is preferred, treat as navigation.
  return accept.includes("text/html");
}

function gateCookieName(token: string): string {
  // keep cookie key stable but scoped by token
  return `s_gate_${sha256Hex(token).slice(0, 16)}`;
}

async function isGateUnlocked(token: string): Promise<boolean> {
  const jar = await cookies();
  const c = jar.get(gateCookieName(token))?.value || "";
  return c === "1";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (shouldRedirectToGate(req)) {
    return NextResponse.redirect(new URL(`/s/${token}`, req.url), 302);
  }

  // Load share metadata
  const r = await sql`
    select
      doc_id::text as doc_id,
      expires_at,
      revoked_at,
      max_views,
      views_count,
      password_hash,
      to_email
    from share_tokens
    where token = ${token}
    limit 1
  `;

  const share = (r as any).rows?.[0] ?? null;
  if (!share) return new NextResponse("Not found", { status: 404 });

  // enforce revoke/expiry/max-views
  if (share.revoked_at) return new NextResponse("Not found", { status: 404 });
  if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (share.max_views !== null && share.max_views !== undefined) {
    const maxv = Number(share.max_views);
    const cur = Number(share.views_count || 0);
    if (!Number.isNaN(maxv) && cur >= maxv) {
      return new NextResponse("Not found", { status: 404 });
    }
  }

  // If gated by email/password, require unlock cookie before serving PDF
  const needsGate = !!share.to_email || !!share.password_hash;
  if (needsGate) {
    const ok = await isGateUnlocked(token);
    if (!ok) {
      // Return 403 (not 404) because token exists but access not yet granted.
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  // Increment views_count best-effort
  try {
    await sql`
      update share_tokens
      set views_count = coalesce(views_count, 0) + 1
      where token = ${token}
    `;
  } catch {
    // ignore
  }

  // Fetch doc
  const docId = share.doc_id;
  const d = await sql`
    select
      storage_key::text as storage_key,
      mime_type::text as mime_type,
      file_name::text as file_name
    from docs
    where id = ${docId}::uuid
    limit 1
  `;
  const doc = (d as any).rows?.[0] ?? null;
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const stream = await getObjectStream(doc.storage_key);
  const mime = doc.mime_type || "application/pdf";
  const filename = doc.file_name || "document.pdf";

  const res = new NextResponse(stream as any, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `inline; filename="${filename}"`,
      // For PDF viewers/range requests:
      "Accept-Ranges": "bytes",
      // Don’t cache sensitive docs by default
      "Cache-Control": "private, no-store, max-age=0",
    },
  });

  return res;
}
