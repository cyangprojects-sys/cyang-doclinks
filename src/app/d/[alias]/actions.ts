"use server";

import { sql } from "@/lib/db";
import { requireOwner } from "@/lib/owner";
import { Resend } from "resend";

export type ShareRow = {
    token: string;
    to_email: string | null;
    created_at: string;
    expires_at: string | null;
    max_views: number | null;
    view_count: number;
    revoked_at: string | null;
};

export type CreateShareResult =
    | { ok: true; token: string; url: string }
    | { ok: false; error: string; message?: string };

export type ShareStatsResult =
    | {
        ok: true;
        token: string;
        doc_id: string;
        alias: string | null;
        to_email: string | null;
        created_at: string;
        expires_at: string | null;
        max_views: number | null;
        view_count: number;
        revoked_at: string | null;
        last_view_at: string | null;
    }
    | { ok: false; error: string; message?: string };

export type RevokeShareResult =
    | { ok: true; token: string }
    | { ok: false; error: string; message?: string };

function mustEnv(name: string) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env: ${name}`);
    return v;
}

function baseUrl() {
    // Prefer explicit site URL. Fall back to Vercel URL.
    return (
        process.env.NEXT_PUBLIC_SITE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
    );
}

function randToken(bytes = 18) {
    // URL-safe token
    const buf = crypto.getRandomValues(new Uint8Array(bytes));
    const b64 = Buffer.from(buf).toString("base64");
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * Create a share token for a doc and email it (optional), returning the URL.
 * Accepts either:
 *  - (docId, opts)
 *  - (formData) where fields: docId, toEmail, expiresAt, maxViews
 */
export async function createAndEmailShareToken(
    docIdOrForm:
        | string
        | FormData,
    opts?: {
        toEmail?: string | null;
        expiresAt?: string | null; // ISO string
        maxViews?: number | null;
    }
): Promise<CreateShareResult> {
    try {
        await requireOwner();

        let docId = "";
        let toEmail: string | null = opts?.toEmail ?? null;
        let expiresAt: string | null = opts?.expiresAt ?? null;
        let maxViews: number | null = opts?.maxViews ?? null;

        if (typeof docIdOrForm === "string") {
            docId = docIdOrForm;
        } else {
            const fd = docIdOrForm;
            docId = String(fd.get("docId") || "");
            toEmail = (fd.get("toEmail") ? String(fd.get("toEmail")) : null) as any;
            expiresAt = (fd.get("expiresAt") ? String(fd.get("expiresAt")) : null) as any;
            const mvRaw = fd.get("maxViews");
            maxViews = mvRaw === null || mvRaw === "" ? null : Number(mvRaw);
            if (Number.isNaN(maxViews as any)) maxViews = null;
        }

        if (!docId) return { ok: false, error: "bad_request", message: "docId is required" };

        // Ensure doc exists and get an alias (best-effort)
        const docRows = await sql<{
            id: string;
            title: string | null;
        }[]>`
      select id::text as id, title
      from docs
      where id = ${docId}::uuid
      limit 1
    `;
        const doc = (docRows as any)[0];
        if (!doc) return { ok: false, error: "not_found", message: "Document not found" };

        let alias: string | null = null;
        try {
            const aRows = await sql<{ alias: string }[]>`
        select alias
        from doc_aliases
        where doc_id = ${docId}::uuid
        limit 1
      `;
            alias = (aRows as any)[0]?.alias ?? null;
        } catch {
            alias = null;
        }

        const token = randToken(20);

        // Create share token row
        await sql`
      insert into share_tokens (token, doc_id, to_email, expires_at, max_views, view_count, revoked_at, created_at)
      values (
        ${token},
        ${docId}::uuid,
        ${toEmail},
        ${expiresAt ? expiresAt : null},
        ${maxViews},
        0,
        null,
        now()
      )
    `;

        const url = `${baseUrl()}/d/${alias ?? docId}?t=${encodeURIComponent(token)}`;

        // Email (optional)
        if (toEmail) {
            const resendKey = process.env.RESEND_API_KEY;
            const from = process.env.EMAIL_FROM || "Cyang Docs <no-reply@cyang.io>";

            if (!resendKey) {
                return { ok: false, error: "missing_env", message: "RESEND_API_KEY is not set" };
            }

            const resend = new Resend(resendKey);

            await resend.emails.send({
                from,
                to: toEmail,
                subject: `Document link: ${doc?.title || "Shared document"}`,
                html: `
          <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
            <p>You’ve been sent a document link:</p>
            <p><a href="${url}">${url}</a></p>
            <p style="color:#666;font-size:12px">If you didn’t expect this email, you can ignore it.</p>
          </div>
        `,
            });
        }

        return { ok: true, token, url };
    } catch (e: any) {
        return { ok: false, error: "server_error", message: e?.message || "Unknown error" };
    }
}

export async function getShareStatsByToken(token: string): Promise<ShareStatsResult> {
    try {
        await requireOwner();

        if (!token) return { ok: false, error: "bad_request", message: "token is required" };

        const rows = await sql<{
            token: string;
            doc_id: string;
            to_email: string | null;
            created_at: string;
            expires_at: string | null;
            max_views: number | null;
            view_count: number;
            revoked_at: string | null;
            last_view_at: string | null;
            alias: string | null;
        }[]>`
      select
        st.token,
        st.doc_id::text as doc_id,
        st.to_email,
        st.created_at::text as created_at,
        st.expires_at::text as expires_at,
        st.max_views,
        st.view_count,
        st.revoked_at::text as revoked_at,
        (
          select max(viewed_at)::text
          from share_views sv
          where sv.token = st.token
        ) as last_view_at,
        (
          select da.alias
          from doc_aliases da
          where da.doc_id = st.doc_id
          limit 1
        ) as alias
      from share_tokens st
      where st.token = ${token}
      limit 1
    `;

        const r = (rows as any)[0];
        if (!r) return { ok: false, error: "not_found", message: "Token not found" };

        return { ok: true, ...r };
    } catch (e: any) {
        // If share_views table doesn't exist yet, still return basic stats
        if (String(e?.message || "").toLowerCase().includes("share_views")) {
            try {
                const rows2 = await sql<{
                    token: string;
                    doc_id: string;
                    to_email: string | null;
                    created_at: string;
                    expires_at: string | null;
                    max_views: number | null;
                    view_count: number;
                    revoked_at: string | null;
                    alias: string | null;
                }[]>`
          select
            st.token,
            st.doc_id::text as doc_id,
            st.to_email,
            st.created_at::text as created_at,
            st.expires_at::text as expires_at,
            st.max_views,
            st.view_count,
            st.revoked_at::text as revoked_at,
            (
              select da.alias
              from doc_aliases da
              where da.doc_id = st.doc_id
              limit 1
            ) as alias
          from share_tokens st
          where st.token = ${token}
          limit 1
        `;
                const r2 = (rows2 as any)[0];
                if (!r2) return { ok: false, error: "not_found", message: "Token not found" };
                return { ok: true, ...r2, last_view_at: null };
            } catch (e2: any) {
                return { ok: false, error: "server_error", message: e2?.message || "Unknown error" };
            }
        }

        return { ok: false, error: "server_error", message: e?.message || "Unknown error" };
    }
}

export async function revokeShareToken(token: string): Promise<RevokeShareResult> {
    try {
        await requireOwner();

        if (!token) return { ok: false, error: "bad_request", message: "token is required" };

        await sql`
      update share_tokens
      set revoked_at = now()
      where token = ${token}
    `;

        return { ok: true, token };
    } catch (e: any) {
        return { ok: false, error: "server_error", message: e?.message || "Unknown error" };
    }
}
