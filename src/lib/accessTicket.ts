import crypto from "node:crypto";
import { sql } from "@/lib/db";
import { getClientIp } from "@/lib/view";

export type AccessTicketPurpose = "preview_view" | "file_download" | "watermarked_file_download";

function bindingSecret() {
  const viewSalt = (process.env.VIEW_SALT || "").trim();
  if (viewSalt) return viewSalt;

  const authSecret = (process.env.NEXTAUTH_SECRET || "").trim();
  if (authSecret) return authSecret;

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
  return Number(process.env.ACCESS_TICKET_TTL_SECONDS || 30);
}

export function signedUrlTtlSeconds() {
  // Signed URL minted *from* a ticket should be even shorter-lived than normal.
  return Number(process.env.ACCESS_TICKET_SIGNED_URL_TTL_SECONDS || 30);
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

  const ttl = ticketTtlSeconds();
  const rows = (await sql`
    insert into public.access_tickets
      (doc_id, share_token, alias, purpose, r2_bucket, r2_key, response_content_type, response_content_disposition, ip_hash, ua_hash, expires_at)
    values
      (${args.docId ?? null}::uuid, ${args.shareToken ?? null}, ${args.alias ?? null}, ${args.purpose}, ${args.r2Bucket}, ${args.r2Key}, ${args.responseContentType}, ${args.responseContentDisposition}, ${ipHash}, ${uaHash}, now() + (${ttl}::text || ' seconds')::interval)
    returning id::text as id
  `) as unknown as Array<{ id: string }>;

  return rows[0]?.id || null;
}

export async function consumeAccessTicket(args: { req: Request; ticketId: string }) {
  const ip = getClientIp(args.req);
  const ua = args.req.headers.get("user-agent") || null;

  const ipHash = hashIpForTicket(ip);
  const uaHash = hashUserAgent(ua);
  const requireIp = !["0", "false", "no", "off"].includes(String(process.env.ACCESS_TICKET_REQUIRE_IP_MATCH || "true").trim().toLowerCase());
  const requireUa = ["1", "true", "yes", "on"].includes(String(process.env.ACCESS_TICKET_REQUIRE_UA_MATCH || "false").trim().toLowerCase());

  if (requireIp && !ipHash) return { ok: false as const };
  if (requireUa && !uaHash) return { ok: false as const };

  // Atomic single-use consume with binding + expiry checks.
  // NOTE: Browsers can legitimately hit the same ticket more than once (preload, retry, iframe reload).
  // Replays are purpose-sensitive: previews can tolerate a short retry window;
  // downloads should be effectively one-time by default.
  const replayGracePreview = Math.max(0, Number(process.env.ACCESS_TICKET_REPLAY_GRACE_SECONDS_PREVIEW || 45));
  const replayGraceDownload = Math.max(0, Number(process.env.ACCESS_TICKET_REPLAY_GRACE_SECONDS_DOWNLOAD || 0));
  const replayGraceWatermarked = Math.max(
    0,
    Number(process.env.ACCESS_TICKET_REPLAY_GRACE_SECONDS_WATERMARKED_DOWNLOAD || replayGraceDownload)
  );

  const consumeRows = (await sql`
    update public.access_tickets
    set used_at = now()
    where id = ${args.ticketId}::uuid
      and used_at is null
      and expires_at > now()
      ${requireIp ? sql`and ip_hash = ${ipHash}` : sql`and (ip_hash is null or ip_hash = ${ipHash})`}
      ${requireUa ? sql`and ua_hash = ${uaHash}` : sql`and (ua_hash is null or ua_hash = ${uaHash})`}
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
    where id = ${args.ticketId}::uuid
      and expires_at > now()
      and used_at is not null
      and used_at > now() - (
        case
          when purpose = 'preview_view' then ${replayGracePreview}::text
          when purpose = 'watermarked_file_download' then ${replayGraceWatermarked}::text
          else ${replayGraceDownload}::text
        end || ' seconds'
      )::interval
      ${requireIp ? sql`and ip_hash = ${ipHash}` : sql`and (ip_hash is null or ip_hash = ${ipHash})`}
      ${requireUa ? sql`and ua_hash = ${uaHash}` : sql`and (ua_hash is null or ua_hash = ${uaHash})`}
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
