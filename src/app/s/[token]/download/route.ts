import { NextRequest, NextResponse } from "next/server";
import { HeadObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { sql } from "@/lib/db";
import { cookies } from "next/headers";
import { consumeShareTokenView } from "@/lib/resolveDoc";
import { assertCanServeView, incrementMonthlyViews } from "@/lib/monetization";
import { enforcePlanLimitsEnabled } from "@/lib/billingFlags";
import { getClientIpFromHeaders, getUserAgentFromHeaders, logDocAccess } from "@/lib/audit";
import crypto from "crypto";
import { rateLimit, rateLimitHeaders, stableHash } from "@/lib/rateLimit";
import { mintAccessTicket } from "@/lib/accessTicket";
import { r2Client, r2Prefix, R2_BUCKET } from "@/lib/r2";
import { stampPdfWithWatermark } from "@/lib/pdfWatermark";

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

function viewerCookieName(token: string) {
  return `share_viewer_${token}`;
}

function randomViewerId() {
  return crypto.randomBytes(18).toString("base64url");
}

async function getOrSetViewerId(token: string): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(viewerCookieName(token))?.value || "";
  if (existing) return existing;

  const v = randomViewerId();
  jar.set(viewerCookieName(token), v, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: `/s/${token}`,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return v;
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

\1
  moderation_status: string;
  scan_status: string;
  risk_level: string;

  // Watermark policy
  share_watermark_enabled: boolean | null;
  share_watermark_text: string | null;
  doc_watermark_enabled: boolean | null;
  doc_watermark_text: string | null;
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

function shortId(v: string) {
  const s = (v || "").trim();
  if (!s) return "unknown";
  return s.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "unknown";
}

function readEnvAbsoluteMaxBytes(): number {
  const raw = (process.env.UPLOAD_ABSOLUTE_MAX_BYTES || "").trim();
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  // Default fuse: 100 MB if not set
  return 100 * 1024 * 1024;
}

async function streamToBuffer(body: any): Promise<Buffer> {
  // AWS SDK v3 returns a Readable stream in Node runtime.
  const chunks: Buffer[] = [];
  for await (const chunk of body as any) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function buildVariantKey(args: {
  docId: string;
  shareToken: string;
  viewerKey: string;
  policyKey: string;
}) {
  const safeDoc = args.docId.replace(/[^a-zA-Z0-9-]/g, "");
  const safeShare = args.shareToken.replace(/[^a-zA-Z0-9_-]/g, "");
  const safeViewer = args.viewerKey.replace(/[^a-zA-Z0-9]/g, "");
  const safePolicy = args.policyKey.replace(/[^a-zA-Z0-9]/g, "");
  return `${r2Prefix}wm/${safeDoc}/${safeShare}/${safeViewer}_${safePolicy}.pdf`;
}

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
      d.r2_key::text as r2_key,
      coalesce(d.moderation_status::text, 'active') as moderation_status,
      coalesce(d.scan_status::text, 'unscanned') as scan_status,
      coalesce(d.risk_level::text, 'low') as risk_level,

      s.watermark_enabled as share_watermark_enabled,
      s.watermark_text::text as share_watermark_text,
      d.watermark_enabled as doc_watermark_enabled,
      d.watermark_text::text as doc_watermark_text
    from public.share_tokens s
    join public.docs d on d.id = s.doc_id
    where s.token = ${token}
    limit 1
  `) as unknown as ShareLookupRow[];

  const share = rows[0];
  if (!share) return new NextResponse("Not found", { status: 404 });
  const moderation = (share.moderation_status || "active").toLowerCase();
  if (moderation !== "active") return new NextResponse("Unavailable", { status: 404 });

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
    if (enforcePlanLimitsEnabled()) {
      return new NextResponse("Temporarily unavailable", { status: 503 });
    }
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
  }

  if (ownerIdForLimit) {
    try {
      await incrementMonthlyViews(ownerIdForLimit, 1);
    } catch {
      if (enforcePlanLimitsEnabled()) {
        return new NextResponse("Temporarily unavailable", { status: 503 });
      }
    }
  }

  // Determine watermark policy (share override, doc fallback)
  const watermarkEnabled = Boolean(share.share_watermark_enabled ?? share.doc_watermark_enabled ?? false);
  const watermarkText = (share.share_watermark_text ?? share.doc_watermark_text ?? "").trim() || null;

  // Ensure we have a stable viewer id cookie for caching.
  const viewerId = await getOrSetViewerId(token);

  // Audit log (best-effort)
  let emailUsed: string | null = null;
  try {
    const jar = await cookies();
    emailUsed = jar.get(emailCookieName(token))?.value || null;
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

    const eventType = watermarkEnabled ? "watermarked_file_download" : "file_download";

    try {
      await sql`
        insert into public.doc_views
          (doc_id, alias, path, kind, user_agent, referer, ip_hash, share_token, event_type)
        values
          (${share.doc_id}::uuid, null, ${new URL(req.url).pathname}, 'share', ${ua}, ${ref}, ${ipHash}, ${token}, ${eventType})
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

  // If watermarking is disabled, fall back to original download behavior.
  if (!watermarkEnabled) {
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

  // --- Watermarked download pipeline ---
  // Variant key: deterministic per share + viewer + policy.
  const viewerKey = stableHash(emailUsed ? `email:${emailUsed}` : `viewer:${viewerId}`, "VIEW_SALT").slice(0, 24);
  const policyKey = stableHash(`${watermarkText || ""}`, "VIEW_SALT").slice(0, 16);
  const variantKey = buildVariantKey({
    docId: share.doc_id,
    shareToken: token,
    viewerKey,
    policyKey,
  });

  // If variant exists, serve it.
  let variantExists = false;
  try {
    await r2Client.send(
      new HeadObjectCommand({
        Bucket: R2_BUCKET,
        Key: variantKey,
      })
    );
    variantExists = true;
  } catch {
    variantExists = false;
  }

  if (!variantExists) {
    // Fetch original PDF bytes and stamp.
    const maxBytes = readEnvAbsoluteMaxBytes();

    const got = await r2Client.send(
      new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: share.r2_key,
      })
    );

    // Hard safety fuse: if original is larger than maxBytes, refuse to stamp.
    const contentLen = Number((got as any).ContentLength || 0);
    if (contentLen && contentLen > maxBytes) {
      return new NextResponse("File too large", {
        status: 413,
        headers: {
          ...rateLimitHeaders(ipRl),
          "Cache-Control": "private, no-store",
        },
      });
    }

    const buf = await streamToBuffer((got as any).Body);
    if (buf.length > maxBytes) {
      return new NextResponse("File too large", {
        status: 413,
        headers: {
          ...rateLimitHeaders(ipRl),
          "Cache-Control": "private, no-store",
        },
      });
    }

    const nowIso = new Date().toISOString();
    const ipHashShort = hashIp(getClientIpFromHeaders(req.headers))?.slice(0, 8) || null;
    const identityLabel = emailUsed
      ? emailUsed
      : `Viewer ${stableHash(viewerId, "VIEW_SALT").slice(0, 8)}`;

    const stamped = await stampPdfWithWatermark(buf, {
      identity: emailUsed ? { kind: "known", label: identityLabel } : { kind: "anon", label: identityLabel },
      timestampIso: nowIso,
      shareIdShort: shortId(token),
      docIdShort: shortId(share.doc_id),
      ipHashShort,
      customText: watermarkText,
    });

    // Store variant in R2 (private object; accessed only via /t tickets).
    // Best-effort write; if it fails we still serve without caching by using an inline ticket to the original.
    try {
      await r2Client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: variantKey,
          Body: stamped,
          ContentType: "application/pdf",
          CacheControl: "private, no-store",
          Metadata: {
            wm: "1",
            share: shortId(token),
            doc: shortId(share.doc_id),
          },
        })
      );
      variantExists = true;
    } catch {
      // ignore cache failure
      variantExists = false;
    }
  }

  const ticketId = await mintAccessTicket({
    req,
    docId: share.doc_id,
    shareToken: token,
    alias: null,
    purpose: "watermarked_file_download",
    r2Bucket: R2_BUCKET,
    r2Key: variantExists ? variantKey : share.r2_key,
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
