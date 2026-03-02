// src/lib/logAccess.ts
import { sql } from "@/lib/db";

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
        const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
        if (isProd) {
            console.warn("Failed to log access.");
        } else {
            const msg = err instanceof Error ? err.message : String(err || "unknown");
            console.warn(`Failed to log access: ${msg}`);
        }
        // Never throw — logging should not break file delivery
    }
}
