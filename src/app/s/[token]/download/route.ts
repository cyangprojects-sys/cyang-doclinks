import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { cookies } from "next/headers";
import { consumeShareTokenView } from "@/lib/resolveDoc";
import { assertCanServeView, incrementMonthlyViews } from "@/lib/monetization";
import { getClientIpFromHeaders, getUserAgentFromHeaders, logDocAccess } from "@/lib/audit";
import crypto from "crypto";
import { rateLimit, rateLimitHeaders, stableHash } from "@/lib/rateLimit";
import { mintAccessTicket } from "@/lib/accessTicket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hashIp(ip: string | null) {
  const salt = (process.env.VIEW_SALT || "").trim();
  if (!salt || !ip) return null;
  return crypto.createHmac("sha256", salt).update(ip).digest("hex").slice(0, 32);
}

function shouldRedirectToGate(req: NextRequest): boolean {
  const accept = (req.headers.get("accept") || "").toLowerCase();
  return accept.includes("text/html");
}

function unlockCookieName(token: string) {
  return `share_unlock_${token}`;
}

function emailCookieName(token: string) {
  return `share_email_${token}`;
}

async function isUnlocked(token: string): Promise<boolean> {
  const jar = await cookies();
  const unlockId = jar.get(unlockCookieName(token))?.value || "";
  if (!unlockId) return false;

  const rows = (await sql`
    select 1
    from public.share_unlocks
    where token = ${token}
      and unlock_id = ${unlockId}
      and expires_at > now()
    limit 1
  `) as unknown as Array<{ "?column?": number }>;

  return rows.length > 0;
}

type ShareLookupRow = {
  token: string;
  doc_id: string;
  expires_at: string | null;
  max_views: number | null;
  views_count: number | null;
  revoked_at: string | null;
  password_hash: string | null;
  r2_key: string;
};

function isExpired(expires_at: string | null) {
  if (!expires_at) return false;
  const t = new Date(expires_at).getTime();
  return Number.isFinite(t) && t <= Date.now();
}

function isMaxed(view_count: number, max_views: number | null) {
  if (max_views === null) return false;
  if (max_views === 0) return false;
  return view_count >= max_views;
}

const R2_BUCKET = (process.env.R2_BUCKET || "").trim();

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // --- Rate limiting (best-effort) ---
  const ip = getClientIpFromHeaders(req.headers) || "";
  const ipKey = stableHash(ip, "VIEW_SALT");
  const tokenKey = stableHash(String(token), "VIEW_SALT");

  const ipRl = await rateLimit({
    scope: "ip:share_download",
    id: ipKey,
    limit: Number(process.env.RATE_LIMIT_SHARE_IP_PER_MIN || 60),
    windowSeconds: 60,
  });
  if (!ipRl.ok) {
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: {
        ...rateLimitHeaders(ipRl),
        "Retry-After": String(ipRl.resetSeconds),
      },
    });
  }

  const tokenRl = await rateLimit({
    scope: "token:share_download",
    id: tokenKey,
    limit: Number(process.env.RATE_LIMIT_SHARE_TOKEN_PER_MIN || 240),
    windowSeconds: 60,
  });
  if (!tokenRl.ok) {
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: {
        ...rateLimitHeaders(tokenRl),
        "Retry-After": String(tokenRl.resetSeconds),
      },
    });
  }

  const rows = (await sql`
    select
      s.token::text as token,
      s.doc_id::text as doc_id,
      s.expires_at::text as expires_at,
      s.max_views,
      s.views_count,
      s.revoked_at::text as revoked_at,
      s.password_hash::text as password_hash,
      d.r2_key::text as r2_key
    from public.share_tokens s
    join public.docs d on d.id = s.doc_id
    where s.token = ${token}
    limit 1
  `) as unknown as ShareLookupRow[];

  const share = rows[0];
  if (!share) return new NextResponse("Not found", { status: 404 });
  if (share.revoked_at) return new NextResponse("Revoked", { status: 410 });
  if (isExpired(share.expires_at)) return new NextResponse("Link expired", { status: 410 });

  const viewCount = share.views_count ?? 0;
  if (isMaxed(viewCount, share.max_views)) return new NextResponse("Max views reached", { status: 410 });

  if (share.password_hash) {
    const unlocked = await isUnlocked(token);
    if (!unlocked) {
      if (shouldRedirectToGate(req)) {
        const url = new URL(`/s/${token}`, req.url);
        return NextResponse.redirect(url);
      }
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  // Consume view on download too (prevents bypassing max views).
  // --- Monetization / plan limits (hidden) ---
let ownerIdForLimit: string | null = null;
try {
  const ownerRows = (await sql`
    select d.owner_id::text as owner_id
    from public.share_tokens st
    join public.docs d on d.id = st.doc_id
    where st.token = ${token}
    limit 1
  `) as unknown as Array<{ owner_id: string | null }>;
  ownerIdForLimit = ownerRows?.[0]?.owner_id ?? null;

  if (ownerIdForLimit) {
    const allowed = await assertCanServeView(ownerIdForLimit);
    if (!allowed.ok) {
      return new NextResponse("Temporarily unavailable", { status: 429 });
    }
  }
} catch {
  ownerIdForLimit = null;
}

const consumed = await consumeShareTokenView(token);
  if (!consumed.ok) {
    switch (consumed.error) {
      case "REVOKED":
        return new NextResponse("Revoked", { status: 410 });
      case "EXPIRED":
        return new NextResponse("Link expired", { status: 410 });
      case "MAXED":
        return new NextResponse("Max views reached", { status: 410 });
      default:
        return new NextResponse("Not found", { status: 404 });
    }

if (ownerIdForLimit) {
  try {
    await incrementMonthlyViews(ownerIdForLimit, 1);
  } catch {
    // ignore
  }
}

  }

  // Audit log (best-effort)
  try {
    const jar = await cookies();
    const emailUsed = jar.get(emailCookieName(token))?.value || null;
    await logDocAccess({
      docId: share.doc_id,
      shareId: share.token,
      alias: null,
      emailUsed,
      ip: getClientIpFromHeaders(req.headers),
      userAgent: getUserAgentFromHeaders(req.headers),
    });
  } catch {
    // ignore
  }

  // Analytics (best-effort)
  try {
    const ip = getClientIpFromHeaders(req.headers);
    const ua = getUserAgentFromHeaders(req.headers);
    const ref = req.headers.get("referer") || null;
    const ipHash = hashIp(ip);

    try {
      await sql`
        insert into public.doc_views
          (doc_id, alias, path, kind, user_agent, referer, ip_hash, share_token, event_type)
        values
          (${share.doc_id}::uuid, null, ${new URL(req.url).pathname}, 'share', ${ua}, ${ref}, ${ipHash}, ${token}, 'file_download')
      `;
    } catch {
      await sql`
        insert into public.doc_views
          (doc_id, alias, path, kind, user_agent, referer, ip_hash)
        values
          (${share.doc_id}::uuid, null, ${new URL(req.url).pathname}, 'share', ${ua}, ${ref}, ${ipHash})
      `;
    }
  } catch {
    // ignore
  }

  const ticketId = await mintAccessTicket({
    req,
    docId: share.doc_id,
    shareToken: token,
    alias: null,
    purpose: "file_download",
    r2Bucket: R2_BUCKET,
    r2Key: share.r2_key,
    responseContentType: "application/pdf",
    responseContentDisposition: "attachment",
  });

  if (!ticketId) {
    return new NextResponse("Server error", {
      status: 500,
      headers: {
        ...rateLimitHeaders(ipRl),
        "Cache-Control": "private, no-store",
      },
    });
  }

  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: new URL(`/t/${ticketId}`, req.url).toString(),
      ...rateLimitHeaders(ipRl),
      "Cache-Control": "private, no-store",
    },
  });
}
