import crypto from "node:crypto";
import { sql } from "@/lib/db";
import { getViewBindingSecret } from "@/lib/envConfig";
import { getClientIp } from "@/lib/view";

export type AccessTicketPurpose = "preview_view" | "file_download" | "watermarked_file_download";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TICKET_TTL_SECONDS = 300;
const MAX_SIGNED_URL_TTL_SECONDS = 300;
const MAX_ALIAS_LEN = 128;
const MAX_SHARE_TOKEN_LEN = 256;
const MAX_BUCKET_LEN = 128;
const MAX_KEY_LEN = 1024;
const MAX_CONTENT_TYPE_LEN = 128;
const MAX_CONTENT_DISPOSITION_LEN = 256;
const MAX_REPLAY_GRACE_SECONDS = 300;

function boundedInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function normalizeUuidOrNull(value: unknown): string | null {
  const s = String(value || "").trim();
  if (!s) return null;
  return UUID_RE.test(s) ? s : null;
}

function normalizeTextOrNull(value: unknown, maxLen: number): string | null {
  const s = String(value || "").trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

function bindingSecret() {
  const bindingKey = getViewBindingSecret();
  if (bindingKey) return bindingKey;

  const allowInsecureFallback =
    process.env.NODE_ENV !== "production" &&
    String(process.env.DEV_ALLOW_INSECURE_FALLBACK || "").trim() === "1";

  if (allowInsecureFallback) {
    return "dev-only-ticket-bind-fallback";
  }

  throw new Error("Missing VIEW_SALT or NEXTAUTH_SECRET for access ticket binding.");
}

function hmacHex(value: string) {
  return crypto.createHmac("sha256", bindingSecret()).update(value).digest("hex");
}

export function hashUserAgent(ua: string | null | undefined) {
  if (!ua) return null;
  return hmacHex(ua).slice(0, 32);
}

export function hashIpForTicket(ip: string | null | undefined) {
  if (!ip) return null;
  return hmacHex(ip).slice(0, 32);
}

export function ticketTtlSeconds() {
  // Ticket itself should be very short-lived; this is the "exchange" window.
  return boundedInt(process.env.ACCESS_TICKET_TTL_SECONDS || 30, 30, 1, MAX_TICKET_TTL_SECONDS);
}

export function signedUrlTtlSeconds() {
  // Signed URL minted *from* a ticket should be even shorter-lived than normal.
  return boundedInt(
    process.env.ACCESS_TICKET_SIGNED_URL_TTL_SECONDS || 30,
    30,
    1,
    MAX_SIGNED_URL_TTL_SECONDS
  );
}

export async function mintAccessTicket(args: {
  req: Request;
  docId?: string | null;
  shareToken?: string | null;
  alias?: string | null;
  purpose: AccessTicketPurpose;
  r2Bucket: string;
  r2Key: string;
  responseContentType: string;
  responseContentDisposition: string;
}) {
  const ip = getClientIp(args.req);
  const ua = args.req.headers.get("user-agent") || null;

  const ipHash = hashIpForTicket(ip);
  const uaHash = hashUserAgent(ua);
  const safeDocId = normalizeUuidOrNull(args.docId);
  const safeShareToken = normalizeTextOrNull(args.shareToken, MAX_SHARE_TOKEN_LEN);
  const safeAlias = normalizeTextOrNull(args.alias, MAX_ALIAS_LEN);
  const safeBucket = normalizeTextOrNull(args.r2Bucket, MAX_BUCKET_LEN);
  const safeKey = normalizeTextOrNull(args.r2Key, MAX_KEY_LEN);
  const safeContentType = normalizeTextOrNull(args.responseContentType, MAX_CONTENT_TYPE_LEN);
  const safeDisposition = normalizeTextOrNull(args.responseContentDisposition, MAX_CONTENT_DISPOSITION_LEN);
  if (!safeBucket || !safeKey || !safeContentType || !safeDisposition) return null;

  const ttl = ticketTtlSeconds();
  const rows = (await sql`
    insert into public.access_tickets
      (doc_id, share_token, alias, purpose, r2_bucket, r2_key, response_content_type, response_content_disposition, ip_hash, ua_hash, expires_at)
    values
      (${safeDocId}::uuid, ${safeShareToken}, ${safeAlias}, ${args.purpose}, ${safeBucket}, ${safeKey}, ${safeContentType}, ${safeDisposition}, ${ipHash}, ${uaHash}, now() + (${ttl}::text || ' seconds')::interval)
    returning id::text as id
  `) as unknown as Array<{ id: string }>;

  return rows[0]?.id || null;
}

export async function consumeAccessTicket(args: { req: Request; ticketId: string }) {
  const ticketId = normalizeUuidOrNull(args.ticketId);
  if (!ticketId) return { ok: false as const };

  const ip = getClientIp(args.req);
  const ua = args.req.headers.get("user-agent") || null;

  const ipHash = hashIpForTicket(ip);
  const uaHash = hashUserAgent(ua);
  const requireIpConfigured = !["0", "false", "no", "off"].includes(
    String(process.env.ACCESS_TICKET_REQUIRE_IP_MATCH || "true").trim().toLowerCase()
  );
  // If we cannot derive a trusted client IP in this environment, skip hard IP matching.
  const requireIp = requireIpConfigured && Boolean(ipHash);
  const requireUa = ["1", "true", "yes", "on"].includes(String(process.env.ACCESS_TICKET_REQUIRE_UA_MATCH || "false").trim().toLowerCase());

  if (requireUa && !uaHash) return { ok: false as const };

  // Atomic single-use consume with binding + expiry checks.
  // NOTE: Browsers can legitimately hit the same ticket more than once (preload, retry, iframe reload).
  // Replays are purpose-sensitive: previews can tolerate a short retry window;
  // downloads should be effectively one-time by default.
  // Security default: disabled unless explicitly enabled.
  const replayEnabled = !["0", "false", "no", "off"].includes(
    String(process.env.ACCESS_TICKET_REPLAY_ENABLED || "false").trim().toLowerCase()
  );
  const replayGracePreview = boundedInt(
    process.env.ACCESS_TICKET_REPLAY_GRACE_SECONDS_PREVIEW || 20,
    20,
    0,
    MAX_REPLAY_GRACE_SECONDS
  );
  // Browsers may issue near-simultaneous duplicate navigations for attachment downloads.
  // Keep a short replay window to avoid false "Not found" on legitimate download clicks.
  const replayGraceDownload = boundedInt(
    process.env.ACCESS_TICKET_REPLAY_GRACE_SECONDS_DOWNLOAD || 0,
    0,
    0,
    MAX_REPLAY_GRACE_SECONDS
  );
  const replayGraceWatermarked = boundedInt(
    process.env.ACCESS_TICKET_REPLAY_GRACE_SECONDS_WATERMARKED_DOWNLOAD || replayGraceDownload,
    replayGraceDownload,
    0,
    MAX_REPLAY_GRACE_SECONDS
  );

  const consumeRows = (await sql`
    update public.access_tickets
    set used_at = now()
    where id = ${ticketId}::uuid
      and used_at is null
      and expires_at > now()
      ${requireIp ? sql`and ip_hash = ${ipHash}` : sql``}
      ${requireUa ? sql`and ua_hash = ${uaHash}` : sql``}
    returning
      id::text as id,
      doc_id::text as doc_id,
      share_token::text as share_token,
      alias::text as alias,
      purpose::text as purpose,
      r2_bucket::text as r2_bucket,
      r2_key::text as r2_key,
      response_content_type::text as response_content_type,
      response_content_disposition::text as response_content_disposition
  `) as unknown as Array<{
    id: string;
    doc_id: string | null;
    share_token: string | null;
    alias: string | null;
    purpose: AccessTicketPurpose;
    r2_bucket: string;
    r2_key: string;
    response_content_type: string;
    response_content_disposition: string;
  }>;

  const consumed = consumeRows[0];
  if (consumed) return { ok: true as const, ticket: consumed };
  if (!replayEnabled) return { ok: false as const };

  // Replay path: ticket was already used; allow a short re-read if still within TTL and within grace.
  const replayRows = (await sql`
    select
      id::text as id,
      doc_id::text as doc_id,
      share_token::text as share_token,
      alias::text as alias,
      purpose::text as purpose,
      r2_bucket::text as r2_bucket,
      r2_key::text as r2_key,
      response_content_type::text as response_content_type,
      response_content_disposition::text as response_content_disposition
    from public.access_tickets
    where id = ${ticketId}::uuid
      and expires_at > now()
      and used_at is not null
      and used_at > now() - (
        case
          when purpose = 'preview_view' then ${replayGracePreview}::text
          when purpose = 'watermarked_file_download' then ${replayGraceWatermarked}::text
          else ${replayGraceDownload}::text
        end || ' seconds'
      )::interval
      ${requireIp ? sql`and ip_hash = ${ipHash}` : sql``}
      ${requireUa ? sql`and ua_hash = ${uaHash}` : sql``}
    limit 1
  `) as unknown as Array<{
    id: string;
    doc_id: string | null;
    share_token: string | null;
    alias: string | null;
    purpose: AccessTicketPurpose;
    r2_bucket: string;
    r2_key: string;
    response_content_type: string;
    response_content_disposition: string;
  }>;

  const replay = replayRows[0];
  if (!replay) return { ok: false as const };
  return { ok: true as const, ticket: replay };
}
