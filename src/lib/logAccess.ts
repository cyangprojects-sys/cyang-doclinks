// src/lib/logAccess.ts
import { sql } from "@/lib/db";

interface LogAccessParams {
    docId: string;
    alias?: string | null;
    token?: string | null;
    ip?: string | null;
    userAgent?: string | null;
}

const MAX_DOC_ID_LEN = 64;
const MAX_ALIAS_LEN = 80;
const MAX_TOKEN_LEN = 128;
const MAX_IP_LEN = 64;
const MAX_USER_AGENT_LEN = 240;

function sanitizeText(value: unknown, maxLen: number): string | null {
    const raw = String(value || "").trim();
    if (!raw || raw.length > maxLen || /[\r\n\0]/.test(raw)) return null;
    return raw;
}

export async function logAccess({
    docId,
    alias,
    token,
    ip,
    userAgent,
}: LogAccessParams) {
    const safeDocId = sanitizeText(docId, MAX_DOC_ID_LEN);
    if (!safeDocId) return;
    const safeAlias = sanitizeText(alias, MAX_ALIAS_LEN);
    const safeToken = sanitizeText(token, MAX_TOKEN_LEN);
    const safeIp = sanitizeText(ip, MAX_IP_LEN);
    const safeUserAgent = sanitizeText(userAgent, MAX_USER_AGENT_LEN);

    try {
        await sql`
      insert into public.doc_access_log (
        doc_id,
        alias,
        token,
        ip,
        user_agent
      )
      values (
        ${safeDocId},
        ${safeAlias},
        ${safeToken},
        ${safeIp},
        ${safeUserAgent}
      )
    `;
    } catch (err) {
        console.warn("Failed to log access.");
        // Never throw — logging should not break file delivery
    }
}
