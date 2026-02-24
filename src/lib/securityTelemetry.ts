import crypto from "crypto"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

/**
 * Hash IP address (privacy safe logging)
 */
export function hashIp(ip: string): string {
    const hash = crypto.createHash("sha256")
    hash.update(ip)
    return hash.digest("hex")
}

/**
 * Log security event
 */
export async function logSecurityEvent(
    type: string,
    details: Record<string, any>,
    ip?: string
) {
    try {
        await sql`
      insert into public.security_events (
        event_type,
        ip_hash,
        metadata,
        created_at
      )
      values (
        ${type},
        ${ip ? hashIp(ip) : null},
        ${JSON.stringify(details)},
        now()
      )
    `
    } catch (err) {
        console.error("Failed to log security event:", err)
    }
}

/**
 * Global API rate limiter (DB-backed)
 */
export async function enforceGlobalApiRateLimit(
    ip: string,
    scope: string,
    limitPerMinute: number
) {
    const ipHash = hashIp(ip)

    const result = await sql`
    select count(*)::int as count
    from public.security_events
    where ip_hash = ${ipHash}
      and event_type = ${"rate_check:" + scope}
      and created_at > now() - interval '1 minute'
  `

    const count = result[0]?.count ?? 0

    if (count >= limitPerMinute) {
        throw new Error("Rate limit exceeded")
    }

    await sql`
    insert into public.security_events (
      event_type,
      ip_hash,
      metadata,
      created_at
    )
    values (
      ${"rate_check:" + scope},
      ${ipHash},
      ${JSON.stringify({ scope })},
      now()
    )
  `
}

/**
 * Log decrypt event
 */
export async function logDecryptEvent(docId: string, ip?: string) {
    try {
        await sql`
      insert into public.doc_decrypt_log (
        doc_id,
        ip_hash,
        created_at
      )
      values (
        ${docId},
        ${ip ? hashIp(ip) : null},
        now()
      )
    `
    } catch (err) {
        console.error("Failed to log decrypt event:", err)
    }
}