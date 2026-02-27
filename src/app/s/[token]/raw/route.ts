import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { cookies } from "next/headers";
import { consumeShareTokenView } from "@/lib/resolveDoc";
import { assertCanServeView, incrementMonthlyViews } from "@/lib/monetization";
import { enforcePlanLimitsEnabled } from "@/lib/billingFlags";
import { getClientIpFromHeaders, getUserAgentFromHeaders, logDocAccess } from "@/lib/audit";
import crypto from "crypto";
import { rateLimit, rateLimitHeaders, stableHash } from "@/lib/rateLimit";
import { mintAccessTicket } from "@/lib/accessTicket";
import { geoDecisionForRequest, getCountryFromHeaders } from "@/lib/geo";
import { hasActiveQuarantineOverride } from "@/lib/quarantineOverride";
import { appendImmutableAudit } from "@/lib/immutableAudit";
import { getR2Bucket } from "@/lib/r2";
import { isSecurityTestNoDbMode, isShareServingDisabled } from "@/lib/securityPolicy";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";
import {
  detectTokenAccessDeniedSpike,
  enforceIpAbuseBlock,
  logDbErrorEvent,
  logSecurityEvent,
  maybeBlockIpOnAbuse,
} from "@/lib/securityTelemetry";
import { assertRuntimeEnv, isRuntimeEnvError } from "@/lib/runtimeEnv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isBlockedTopLevelOpen(req: NextRequest): boolean {
  const dest = (req.headers.get("sec-fetch-dest") || "").toLowerCase();
  const mode = (req.headers.get("sec-fetch-mode") || "").toLowerCase();
  const user = (req.headers.get("sec-fetch-user") || "").toLowerCase();
  // Block user-initiated top-level navigation (address bar / new-tab open).
  // Keep iframe/embed and internal range fetches working.
  return dest === "document" && mode === "navigate" && user === "?1";
}

function hashIp(ip: string | null) {
  const salt = (process.env.VIEW_SALT || "").trim();
  if (!salt || !ip) return null;
  return crypto.createHmac("sha256", salt).update(ip).digest("hex").slice(0, 32);
}

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

function emailCookieName(token: string) {
  // Must match src/app/s/[token]/actions.ts
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
  views_count: number;
  revoked_at: string | null;
  password_hash: string | null;
  r2_key: string;
  content_type: string | null;

  // Moderation/scan
  moderation_status: string;
  scan_status: string;
  risk_level: string;
  share_active: boolean;
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
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_SHARE_RAW_MS", 25_000);
  try {
    return await withRouteTimeout(
      (async () => {
        assertRuntimeEnv("share_raw");

        if (isSecurityTestNoDbMode()) {
          return new NextResponse("Not found", { status: 404 });
        }

  if (await isShareServingDisabled()) {
    return new NextResponse("Unavailable", { status: 503 });
  }

  const r2Bucket = getR2Bucket();
  const { token } = await params;
  const ip = getClientIpFromHeaders(req.headers) || "";
  const abuseBlock = await enforceIpAbuseBlock({ req, scope: "share_raw" });
  if (!abuseBlock.ok) {
    return new NextResponse("Forbidden", {
      status: 403,
      headers: { "Retry-After": String(abuseBlock.retryAfterSeconds) },
    });
  }
  const deny = async (reason: string, status = 404, body?: string) => {
    await logSecurityEvent({
      type: "share_access_denied",
      severity: status === 429 ? "medium" : "low",
      ip,
      scope: "share_raw",
      message: "Share raw access denied",
      meta: { token, reason, status },
    });
    await detectTokenAccessDeniedSpike({ ip });
    if (
      reason === "not_found" ||
      reason === "password_required" ||
      reason === "ip_rate_limit" ||
      reason === "token_rate_limit"
    ) {
      await maybeBlockIpOnAbuse({
        ip,
        category: "share_token_abuse",
        scope: "share_raw",
        threshold: Number(process.env.ABUSE_BLOCK_TOKEN_THRESHOLD || 25),
        windowSeconds: Number(process.env.ABUSE_BLOCK_TOKEN_WINDOW_SECONDS || 600),
        blockSeconds: Number(process.env.ABUSE_BLOCK_TTL_SECONDS || 3600),
        reason: "Repeated share token abuse attempts",
        meta: { reason, status },
      });
    }
    return new NextResponse(body ?? (status === 429 ? "Too Many Requests" : "Not found"), { status });
  };

  if (isBlockedTopLevelOpen(req)) {
    return await deny("top_level_blocked", 403, "Direct open is disabled for this shared document.");
  }

  // --- Rate limiting (best-effort) ---
  const ipKey = stableHash(ip, "VIEW_SALT");
  const tokenKey = stableHash(String(token), "VIEW_SALT");

  const ipRl = await rateLimit({
    scope: "ip:share_preview",
    id: ipKey,
    limit: Number(process.env.RATE_LIMIT_SHARE_IP_PER_MIN || 60),
    windowSeconds: 60,
  });
  if (!ipRl.ok) {
    await logSecurityEvent({
      type: "share_access_denied",
      severity: "medium",
      ip,
      scope: "share_raw",
      message: "Share raw rate-limited",
      meta: { token, reason: "ip_rate_limit", status: 429 },
    });
    await detectTokenAccessDeniedSpike({ ip });
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: {
        ...rateLimitHeaders(ipRl),
        "Retry-After": String(ipRl.resetSeconds),
      },
    });
  }

  const tokenRl = await rateLimit({
    scope: "token:share_preview",
    id: tokenKey,
    limit: Number(process.env.RATE_LIMIT_SHARE_TOKEN_PER_MIN || 240),
    windowSeconds: 60,
  });
  if (!tokenRl.ok) {
    await logSecurityEvent({
      type: "share_access_denied",
      severity: "medium",
      ip,
      scope: "share_raw",
      message: "Share raw rate-limited",
      meta: { token, reason: "token_rate_limit", status: 429 },
    });
    await detectTokenAccessDeniedSpike({ ip });
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: {
        ...rateLimitHeaders(tokenRl),
        "Retry-After": String(tokenRl.resetSeconds),
      },
    });
  }

  let rows: ShareLookupRow[] = [];
  try {
    rows = (await sql`
      select
        s.token::text as token,
        s.doc_id::text as doc_id,
        s.expires_at::text as expires_at,
        s.max_views,
        s.views_count,
        s.revoked_at::text as revoked_at,
        s.password_hash::text as password_hash,
        d.r2_key::text as r2_key,
        d.content_type::text as content_type,
        coalesce(d.moderation_status::text, 'active') as moderation_status,
        coalesce(d.scan_status::text, 'unscanned') as scan_status,
        coalesce(d.risk_level::text, 'low') as risk_level,
        coalesce(s.is_active, true) as share_active
      from public.share_tokens s
      join public.docs d on d.id = s.doc_id
      where s.token = ${token}
      limit 1
    `) as unknown as ShareLookupRow[];
  } catch {
    rows = (await sql`
      select
        s.token::text as token,
        s.doc_id::text as doc_id,
        s.expires_at::text as expires_at,
        s.max_views,
        s.views_count,
        s.revoked_at::text as revoked_at,
        s.password_hash::text as password_hash,
        d.r2_key::text as r2_key,
        d.content_type::text as content_type,
        coalesce(d.moderation_status::text, 'active') as moderation_status,
        coalesce(d.scan_status::text, 'unscanned') as scan_status,
        coalesce(d.risk_level::text, 'low') as risk_level,
        true as share_active
      from public.share_tokens s
      join public.docs d on d.id = s.doc_id
      where s.token = ${token}
      limit 1
    `) as unknown as ShareLookupRow[];
  }

  const share = rows[0];
  if (!share) return await deny("not_found");
  if (!share.share_active) return await deny("inactive", 404, "Unavailable");
  const moderation = (share.moderation_status || "active").toLowerCase();
  if (moderation !== "active") {
    if (moderation !== "quarantined") return await deny(`moderation_${moderation}`, 404, "Unavailable");
    const override = await hasActiveQuarantineOverride(share.doc_id);
    if (!override) return await deny("quarantined", 404, "Unavailable");
  }
  const blockedScanStates = new Set([
    "unscanned",
    "queued",
    "running",
    "failed",
    "error",
    "infected",
    "quarantined",
  ]);
  if (blockedScanStates.has((share.scan_status || "unscanned").toLowerCase())) {
    return await deny(`scan_${String(share.scan_status || "unscanned").toLowerCase()}`, 404, "Unavailable");
  }

  const risk = (share.risk_level || "low").toLowerCase();
  const riskyInline = risk === "high" || (share.scan_status || "").toLowerCase() === "risky";
  if (riskyInline) {
    // Inline viewing is disabled for high-risk docs; download route can still serve as attachment.
    return await deny("risky_inline_blocked", 403, "Inline viewing disabled");
  }


  // Geo-based restriction (best-effort)
  const country = getCountryFromHeaders(req.headers);
  const geo = await geoDecisionForRequest({ country, docId: share.doc_id, token });
  if (!geo.allowed) return await deny("geo_blocked", 403, "Forbidden");

  if (share.revoked_at) return await deny("revoked", 410, "Revoked");
  if (isExpired(share.expires_at)) return await deny("expired", 410, "Link expired");

  const viewCount = share.views_count ?? 0;
  if (isMaxed(viewCount, share.max_views)) {
    return await deny("maxed", 410, "Max views reached");
  }

  // If share is password protected, require an active unlock record (set by /s/[token] gate)
  if (share.password_hash) {
    const unlocked = await isUnlocked(token);
    if (!unlocked) {
      if (shouldRedirectToGate(req)) {
        const url = new URL(`/s/${token}`, req.url);
        return NextResponse.redirect(url);
      }
      return await deny("password_required", 401, "Unauthorized");
    }
  }

  // Enforce + increment max views here too (raw link is often what the PDF viewer hits).
  // We only count once per initial range request to avoid burning views on chunked fetches.
  if (shouldCountView(req)) {
    // --- Monetization / plan limits (hidden) ---
    // Enforce the *document owner's* monthly view cap before consuming a share view.
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
          return await deny("owner_view_limit_reached", 429, "Temporarily unavailable");
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
          return await deny("revoked_after_consume", 410, "Revoked");
        case "EXPIRED":
          return await deny("expired_after_consume", 410, "Link expired");
        case "MAXED":
          return await deny("maxed_after_consume", 410, "Max views reached");
        default:
          return await deny("not_found_after_consume");
      }
    }

    // Count view against the owner's monthly quota.
    if (ownerIdForLimit) {
      try {
        await incrementMonthlyViews(ownerIdForLimit, 1);
      } catch {
        if (enforcePlanLimitsEnabled()) {
          return new NextResponse("Temporarily unavailable", { status: 503 });
        }
      }
    }

    // Audit log (best-effort) — only on the first counted request
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
    try {
      await appendImmutableAudit({
        streamKey: `doc:${share.doc_id}`,
        action: "share.view",
        docId: share.doc_id,
        subjectId: token,
        ipHash: hashIp(getClientIpFromHeaders(req.headers)),
        payload: {
          route: "s_token_raw",
          eventType: "preview_view",
          riskLevel: share.risk_level || "low",
          scanStatus: share.scan_status || "unscanned",
        },
      });
    } catch {
      // ignore
    }
    // Analytics (best-effort) only on first counted request
    try {
      const ip = getClientIpFromHeaders(req.headers);
      const ua = getUserAgentFromHeaders(req.headers);
      const ref = req.headers.get("referer") || null;
      const ipHash = hashIp(ip);

      // Try newer schema first (share_token + event_type). Fall back to legacy schema.
      try {
        await sql`
          insert into public.doc_views
            (doc_id, alias, path, kind, user_agent, referer, ip_hash, share_token, event_type)
          values
            (${share.doc_id}::uuid, null, ${new URL(req.url).pathname}, 'share', ${ua}, ${ref}, ${ipHash}, ${token}, 'preview_view')
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
  }

  const ticketId = await mintAccessTicket({
    req,
    docId: share.doc_id,
    shareToken: token,
    alias: null,
    purpose: "preview_view",
    r2Bucket,
    r2Key: share.r2_key,
    responseContentType: share.content_type || "application/octet-stream",
    responseContentDisposition: "inline",
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
      })(),
      timeoutMs
    );
  } catch (e: unknown) {
    if (isRuntimeEnvError(e)) {
      return new NextResponse("Unavailable", { status: 503 });
    }
    if (isRouteTimeoutError(e)) {
      await logSecurityEvent({
        type: "share_raw_timeout",
        severity: "high",
        ip: getClientIpFromHeaders(req.headers) || null,
        scope: "share_raw",
        message: "Share raw route exceeded timeout",
        meta: { timeoutMs },
      });
      return new NextResponse("Gateway Timeout", { status: 504 });
    }
    if (e instanceof Error) {
      await logDbErrorEvent({
        scope: "share_raw",
        message: e.message,
        ip: getClientIpFromHeaders(req.headers) || null,
        meta: { route: "/s/[token]/raw" },
      });
    }
    throw e;
  }
}


