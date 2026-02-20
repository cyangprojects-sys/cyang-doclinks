// src/lib/logAccess.ts
import { sql } from "@/lib/db";
import { emitWebhook } from "@/lib/webhooks";

interface LogAccessParams {
    docId: string;
    alias?: string | null;
    token?: string | null;
    ip?: string | null;
    userAgent?: string | null;
}

export async function logAccess({
    docId,
    alias,
    token,
    ip,
    userAgent,
}: LogAccessParams) {
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
        ${docId},
        ${alias ?? null},
        ${token ?? null},
        ${ip ?? null},
        ${userAgent ?? null}
      )
    `;
    } catch (err) {
        console.error("Failed to log access:", err);
        // Never throw — logging should not break file delivery
    }
}