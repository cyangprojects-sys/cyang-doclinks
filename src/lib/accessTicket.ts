import crypto from "node:crypto";
import { sql } from "@/lib/db";
import { getClientIp } from "@/lib/view";

export type AccessTicketPurpose = "preview_view" | "file_download" | "watermarked_file_download";

function hmacHex(value: string, salt: string) {
  return crypto.createHmac("sha256", salt).update(value).digest("hex");
}

export function hashUserAgent(ua: string | null | undefined) {
  const salt = (process.env.VIEW_SALT || "").trim();
  if (!salt || !ua) return null;
  return hmacHex(ua, salt).slice(0, 32);
}

export function hashIpForTicket(ip: string | null | undefined) {
  const salt = (process.env.VIEW_SALT || "").trim();
  if (!salt || !ip) return null;
  return hmacHex(ip, salt).slice(0, 32);
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

  // Atomic single-use consume with binding + expiry checks.
  const rows = (await sql`
    update public.access_tickets
    set used_at = now()
    where id = ${args.ticketId}::uuid
      and used_at is null
      and expires_at > now()
      and (ip_hash is null or ip_hash = ${ipHash})
      and (ua_hash is null or ua_hash = ${uaHash})
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

  const t = rows[0];
  if (!t) return { ok: false as const };
  return { ok: true as const, ticket: t };
}
