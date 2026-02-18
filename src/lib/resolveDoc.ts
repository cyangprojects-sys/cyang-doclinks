// src/lib/resolveDoc.ts
import { sql } from "@/lib/db";
import { R2_BUCKET } from "@/lib/r2";

export type ResolveInput =
    | { alias: string }
    | { token: string }
    | { docId: string };

export type ResolvedDocOk = {
    ok: true;
    source: "alias" | "token" | "direct";
    docId: string;

    // R2 pointer (normalized)
    bucket: string;
    r2Key: string;

    // Metadata (nice to have for headers / filenames)
    title: string | null;
    originalFilename: string | null;
    contentType: string | null;
    sizeBytes: number | null;

    // Auth/gating flags
    requiresPassword: boolean;

    // Token-specific (when source=token)
    token?: string;
};

export type ResolvedDocErr = {
    ok: false;
    error: "NOT_FOUND" | "EXPIRED" | "REVOKED" | "PASSWORD_REQUIRED" | "MAXED";
};

export type ResolvedDoc = ResolvedDocOk | ResolvedDocErr;

export type ShareMeta =
    | {
        ok: true;
        table: "doc_shares" | "share_tokens";
        token: string;
        toEmail: string | null;
        createdAt: string;
        expiresAt: string | null;
        maxViews: number | null;
        viewCount: number;
        revokedAt: string | null;
        hasPassword: boolean;
        passwordHash: string | null;
        docId: string;
    }
    | { ok: false };

function isExpired(expiresAt: string | Date | null): boolean {
    if (!expiresAt) return false;
    const t = typeof expiresAt === "string" ? new Date(expiresAt).getTime() : expiresAt.getTime();
    return Number.isFinite(t) && t <= Date.now();
}

function isMaxed(viewCount: number, maxViews: number | null): boolean {
    if (maxViews === null) return false;
    if (maxViews === 0) return false; // 0 = unlimited
    return viewCount >= maxViews;
}

async function getDocPointer(docId: string): Promise<
    | {
        ok: true;
        docId: string;
        bucket: string;
        r2Key: string;
        title: string | null;
        originalFilename: string | null;
        contentType: string | null;
        sizeBytes: number | null;
    }
    | { ok: false }
> {
    // Prefer r2_bucket/r2_key; tolerate older bucket/key shapes.
    const rows = (await sql`
    select
      d.id::text as id,
      coalesce(d.r2_bucket::text, d.bucket::text, ${R2_BUCKET}) as bucket,
      coalesce(d.r2_key::text, d.r2_key::text) as r2_key,
      d.title::text as title,
      d.original_filename::text as original_filename,
      d.content_type::text as content_type,
      d.size_bytes::bigint as size_bytes,
      coalesce(d.status::text, '') as status
    from public.docs d
    where d.id = ${docId}::uuid
    limit 1
  `) as unknown as Array<{
        id: string;
        bucket: string | null;
        r2_key: string | null;
        title: string | null;
        original_filename: string | null;
        content_type: string | null;
        size_bytes: string | number | null;
        status: string;
    }>;

    const r = rows?.[0];
    if (!r?.id) return { ok: false };

    // honor "deleted" status if present (serve route already did this)
    if ((r.status || "").toLowerCase() === "deleted") return { ok: false };

    if (!r.bucket || !r.r2_key) return { ok: false };

    return {
        ok: true,
        docId: r.id,
        bucket: r.bucket || R2_BUCKET,
        r2Key: r.r2_key,
        title: r.title ?? null,
        originalFilename: r.original_filename ?? null,
        contentType: r.content_type ?? null,
        sizeBytes: r.size_bytes == null ? null : Number(r.size_bytes),
    };
}

async function resolveAliasToDocId(alias: string): Promise<
    | {
        ok: true;
        docId: string;
        revokedAt: string | null;
        expiresAt: string | null;
        passwordHash: string | null;
    }
    | { ok: false }
> {
    // 1) Preferred table: public.doc_aliases
    // Some environments may not have password_hash on alias rows.
    try {
        const rows = (await sql`
      select
        a.doc_id::text as doc_id,
        a.revoked_at::text as revoked_at,
        a.expires_at::text as expires_at,
        a.password_hash::text as password_hash
      from public.doc_aliases a
      where a.alias = ${alias}
      limit 1
    `) as unknown as Array<{
            doc_id: string;
            revoked_at: string | null;
            expires_at: string | null;
            password_hash: string | null;
        }>;

        if (rows?.length) {
            const r = rows[0];
            return {
                ok: true,
                docId: r.doc_id,
                revokedAt: r.revoked_at ?? null,
                expiresAt: r.expires_at ?? null,
                passwordHash: r.password_hash ?? null,
            };
        }
    } catch {
        // fall through
    }

    // 1b) doc_aliases without password_hash
    try {
        const rows = (await sql`
      select
        a.doc_id::text as doc_id,
        a.revoked_at::text as revoked_at,
        a.expires_at::text as expires_at
      from public.doc_aliases a
      where a.alias = ${alias}
      limit 1
    `) as unknown as Array<{
            doc_id: string;
            revoked_at: string | null;
            expires_at: string | null;
        }>;

        if (rows?.length) {
            const r = rows[0];
            return {
                ok: true,
                docId: r.doc_id,
                revokedAt: r.revoked_at ?? null,
                expiresAt: r.expires_at ?? null,
                passwordHash: null,
            };
        }
    } catch {
        // fall through
    }

    // 2) Legacy table: document_aliases (used by older email auth flow)
    try {
        const rows = (await sql`
      select
        a.doc_id::text as doc_id,
        null::text as revoked_at,
        a.expires_at::text as expires_at,
        a.password_hash::text as password_hash
      from public.document_aliases a
      where a.alias = ${alias}
      limit 1
    `) as unknown as Array<{
            doc_id: string;
            revoked_at: string | null;
            expires_at: string | null;
            password_hash: string | null;
        }>;

        if (rows?.length) {
            const r = rows[0];
            return {
                ok: true,
                docId: r.doc_id,
                revokedAt: r.revoked_at ?? null,
                expiresAt: r.expires_at ?? null,
                passwordHash: r.password_hash ?? null,
            };
        }
    } catch {
        // ignore
    }

    return { ok: false };
}

/**
 * Read-only share meta (NO increment). Used by /s/[token] page and password verify.
 */
export async function resolveShareMeta(token: string): Promise<ShareMeta> {
    // Prefer doc_shares
    try {
        const rows = (await sql`
      select
        token::text as token,
        doc_id::text as doc_id,
        to_email,
        created_at::text as created_at,
        expires_at::text as expires_at,
        max_views,
        view_count,
        revoked_at::text as revoked_at,
        password_hash
      from public.doc_shares
      where token = ${token}
      limit 1
    `) as unknown as Array<{
            token: string;
            doc_id: string;
            to_email: string | null;
            created_at: string;
            expires_at: string | null;
            max_views: number | null;
            view_count: number | null;
            revoked_at: string | null;
            password_hash: string | null;
        }>;

        if (rows?.length) {
            const r = rows[0];
            return {
                ok: true,
                table: "doc_shares",
                token: r.token,
                docId: r.doc_id,
                toEmail: r.to_email ?? null,
                createdAt: r.created_at,
                expiresAt: r.expires_at ?? null,
                maxViews: r.max_views,
                viewCount: Number(r.view_count ?? 0),
                revokedAt: r.revoked_at ?? null,
                hasPassword: Boolean(r.password_hash),
                passwordHash: r.password_hash ?? null,
            };
        }
    } catch {
        // ignore
    }

    // Fallback share_tokens
    try {
        const rows = (await sql`
      select
        token::text as token,
        doc_id::text as doc_id,
        to_email,
        created_at::text as created_at,
        expires_at::text as expires_at,
        max_views,
        views_count,
        revoked_at::text as revoked_at,
        password_hash
      from public.share_tokens
      where token::text = ${token}
         or token = ${token}
      limit 1
    `) as unknown as Array<{
            token: string;
            doc_id: string;
            to_email: string | null;
            created_at: string;
            expires_at: string | null;
            max_views: number | null;
            views_count: number | null;
            revoked_at: string | null;
            password_hash: string | null;
        }>;

        if (rows?.length) {
            const r = rows[0];
            return {
                ok: true,
                table: "share_tokens",
                token: r.token,
                docId: r.doc_id,
                toEmail: r.to_email ?? null,
                createdAt: r.created_at,
                expiresAt: r.expires_at ?? null,
                maxViews: r.max_views,
                viewCount: Number(r.views_count ?? 0),
                revokedAt: r.revoked_at ?? null,
                hasPassword: Boolean(r.password_hash),
                passwordHash: r.password_hash ?? null,
            };
        }
    } catch {
        // ignore
    }

    return { ok: false };
}

/**
 * Token resolution for /raw: increments views atomically while enforcing revoked/expired/max_views.
 * Keeps your current behavior: increments even if password-gated.
 */
async function resolveTokenAndIncrement(token: string): Promise<
    | {
        ok: true;
        docId: string;
        passwordHash: string | null;
        table: "doc_shares" | "share_tokens";
    }
    | { ok: false; error: "NOT_FOUND" | "REVOKED" | "EXPIRED" | "MAXED" }
> {
    // doc_shares
    try {
        const rows = (await sql`
      update public.doc_shares s
      set view_count = s.view_count + 1
      where s.token = ${token}
        and s.revoked_at is null
        and (s.expires_at is null or s.expires_at > now())
        and (s.max_views is null or s.max_views = 0 or s.view_count < s.max_views)
      returning s.doc_id::text as doc_id, s.password_hash
    `) as unknown as Array<{ doc_id: string; password_hash: string | null }>;

        if (rows?.length) {
            return { ok: true, docId: rows[0].doc_id, passwordHash: rows[0].password_hash ?? null, table: "doc_shares" };
        }
    } catch {
        // ignore table missing
    }

    // share_tokens
    try {
        const rows = (await sql`
      update public.share_tokens st
      set views_count = st.views_count + 1
      where (st.token::text = ${token} or st.token = ${token})
        and st.revoked_at is null
        and (st.expires_at is null or st.expires_at > now())
        and (st.max_views is null or st.max_views = 0 or st.views_count < st.max_views)
      returning st.doc_id::text as doc_id, st.password_hash
    `) as unknown as Array<{ doc_id: string; password_hash: string | null }>;

        if (rows?.length) {
            return { ok: true, docId: rows[0].doc_id, passwordHash: rows[0].password_hash ?? null, table: "share_tokens" };
        }
    } catch {
        // ignore
    }

    // Distinguish *why* it failed (best-effort read-only check)
    const meta = await resolveShareMeta(token);
    if (!meta.ok) return { ok: false, error: "NOT_FOUND" };
    if (meta.revokedAt) return { ok: false, error: "REVOKED" };
    if (isExpired(meta.expiresAt)) return { ok: false, error: "EXPIRED" };
    if (isMaxed(meta.viewCount, meta.maxViews)) return { ok: false, error: "MAXED" };
    return { ok: false, error: "NOT_FOUND" };
}

export async function resolveDoc(input: ResolveInput): Promise<ResolvedDoc> {
    // DIRECT
    if ("docId" in input) {
        const doc = await getDocPointer(String(input.docId || "").trim());
        if (!doc.ok) return { ok: false, error: "NOT_FOUND" };

        return {
            ok: true,
            source: "direct",
            docId: doc.docId,
            bucket: doc.bucket,
            r2Key: doc.r2Key,
            title: doc.title,
            originalFilename: doc.originalFilename,
            contentType: doc.contentType,
            sizeBytes: doc.sizeBytes,
            requiresPassword: false,
        };
    }

    // ALIAS
    if ("alias" in input) {
        const alias = String(input.alias || "").trim();
        if (!alias) return { ok: false, error: "NOT_FOUND" };

        const a = await resolveAliasToDocId(alias);
        if (!a.ok) return { ok: false, error: "NOT_FOUND" };
        if (a.revokedAt) return { ok: false, error: "REVOKED" };
        if (isExpired(a.expiresAt)) return { ok: false, error: "EXPIRED" };
        if (a.passwordHash) return { ok: false, error: "PASSWORD_REQUIRED" };

        const doc = await getDocPointer(a.docId);
        if (!doc.ok) return { ok: false, error: "NOT_FOUND" };

        return {
            ok: true,
            source: "alias",
            docId: doc.docId,
            bucket: doc.bucket,
            r2Key: doc.r2Key,
            title: doc.title,
            originalFilename: doc.originalFilename,
            contentType: doc.contentType,
            sizeBytes: doc.sizeBytes,
            requiresPassword: false,
        };
    }

    // TOKEN (raw behavior = increment + enforce max/revoked/expired)
    if ("token" in input) {
        const token = String(input.token || "").trim();
        if (!token) return { ok: false, error: "NOT_FOUND" };

        const t = await resolveTokenAndIncrement(token);
        if (!t.ok) return { ok: false, error: t.error };

        const doc = await getDocPointer(t.docId);
        if (!doc.ok) return { ok: false, error: "NOT_FOUND" };

        return {
            ok: true,
            source: "token",
            token,
            docId: doc.docId,
            bucket: doc.bucket,
            r2Key: doc.r2Key,
            title: doc.title,
            originalFilename: doc.originalFilename,
            contentType: doc.contentType,
            sizeBytes: doc.sizeBytes,
            requiresPassword: Boolean(t.passwordHash),
        };
    }

    return { ok: false, error: "NOT_FOUND" };
}
