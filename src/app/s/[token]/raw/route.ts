import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, r2Bucket } from "@/lib/r2";
import { cookies } from "next/headers";
import { consumeShareTokenView } from "@/lib/resolveDoc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * We only redirect to password gate when this is a browser navigation
 * requesting HTML.
 *
 * When the embedded PDF viewer fetches the PDF, Accept is usually
 * application/pdf or * / * (not text/html), so we keep serving the PDF normally.
 */
function shouldRedirectToGate(req: NextRequest): boolean {
  const accept = (req.headers.get("accept") || "").toLowerCase();
  return accept.includes("text/html");
}

function unlockCookieName(token: string) {
  // Must match src/app/s/[token]/actions.ts
  return `share_unlock_${token}`;
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

async function getObjectStream(key: string) {
  const out = await r2Client.send(
    new GetObjectCommand({
      Bucket: r2Bucket,
      Key: key,
    })
  );

  if (!out.Body) throw new Error("Missing object body from R2");
  return out.Body as any;
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
  if (max_views === 0) return false; // 0 = unlimited
  return view_count >= max_views;
}

/**
 * Avoid counting every byte-range follow-up as a new "view".
 * Most PDF viewers request ranges; we count only the first request that includes byte 0.
 */
function shouldCountView(req: NextRequest): boolean {
  const range = (req.headers.get("range") || "").toLowerCase();
  if (!range) return true; // full request

  // Examples: "bytes=0-" or "bytes=0-65535" should count; later ranges should not.
  return range.includes("bytes=0-");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

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
  if (isMaxed(viewCount, share.max_views)) {
    return new NextResponse("Max views reached", { status: 410 });
  }

  // If share is password protected, require an active unlock record (set by /s/[token] gate)
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

  // Enforce + increment max views here too (raw link is often what the PDF viewer hits).
  // We only count once per initial range request to avoid burning views on chunked fetches.
  if (shouldCountView(req)) {
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
    }
  }

  const body = await getObjectStream(share.r2_key);

  return new NextResponse(body as any, {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
    },
  });
}
