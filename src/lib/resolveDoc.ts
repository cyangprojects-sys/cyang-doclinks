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
        table: "share_tokens";

        // token is the stable primary key in your schema
        shareId: string;
        token: string;

        docId: string;

        toEmail: string | null;
        createdAt: string;
        expiresAt: string | null;
        maxViews: number | null;
        viewCount: number;
        revokedAt: string | null;

        hasPassword: boolean;
        passwordHash: string | null;
    }
    | { ok: false };


function norm(s: string): string {
    return decodeURIComponent(String(s || "")).trim().toLowerCase();
}

function normEmail(s: string | null | undefined): string | null {
    const v = String(s || "").trim().toLowerCase();
    return v ? v : null;
}

function isExpired(expiresAt: string | Date | null): boolean {
    if (!expiresAt) return false;
    const t =
        typeof expiresAt === "string"
            ? new Date(expiresAt).getTime()
            : expiresAt.getTime();
    return Number.isFinite(t) && t <= Date.now();
}

function isMaxed(viewCount: number, maxViews: number | null): boolean {
    if (maxViews === null) return false;
    if (maxViews === 0) return false; // 0 = unlimited
    return viewCount >= maxViews;
}

// Email link tokens can be 32-hex-without-dashes while DB stores UUID w/ dashes.
// Generate both variants and query using both.
function tokenVariants(tokenInput: string): { raw: string; dashed: string | null } {
    const raw = String(tokenInput || "").trim();
    if (!raw) return { raw: "", dashed: null };

    // Already dashed UUID?
    const isDashedUuid = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(
        raw
    );
    if (isDashedUuid) return { raw: raw.toLowerCase(), dashed: raw.toLowerCase() };

    // 32-hex => dashed UUID
    const isHex32 = /^[a-fA-F0-9]{32}$/.test(raw);
    if (!isHex32) return { raw, dashed: null };

    const lower = raw.toLowerCase();
    const dashed = `${lower.slice(0, 8)}-${lower.slice(8, 12)}-${lower.slice(
        12,
        16
    )}-${lower.slice(16, 20)}-${lower.slice(20)}`;
    return { raw: lower, dashed };
}

async function getDocPointer(
    docId: string
): Promise<
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
    const id = String(docId || "").trim();
    if (!id) return { ok: false };

    const rows = (await sql`
    select
      d.id::text as id,
      coalesce(d.r2_bucket::text, ${R2_BUCKET}) as bucket,
      d.r2_key::text as r2_key,
      d.title::text as title,
      d.original_filename::text as original_filename,
      d.content_type::text as content_type,
      d.size_bytes::bigint as size_bytes,
      coalesce(d.status::text, '') as status
    from public.docs d
    where d.id = ${id}::uuid
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

async function resolveAliasToDocId(
    aliasInput: string
): Promise<
    | {
        ok: true;
        docId: string;
        revokedAt: string | null;
        expiresAt: string | null;
        passwordHash: string | null;
    }
    | { ok: false }
> {
    const alias = norm(aliasInput);
    if (!alias) return { ok: false };

    // Preferred: doc_aliases (case-insensitive + require is_active if present)
    // Try with password_hash first (some envs have it, some don't)
    try {
        const rows = (await sql`
      select
        a.doc_id::text as doc_id,
        a.revoked_at::text as revoked_at,
        a.expires_at::text as expires_at,
        a.password_hash::text as password_hash
      from public.doc_aliases a
      where lower(a.alias) = ${alias}
        and coalesce(a.is_active, true) = true
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

    // doc_aliases without password_hash
    try {
        const rows = (await sql`
      select
        a.doc_id::text as doc_id,
        a.revoked_at::text as revoked_at,
        a.expires_at::text as expires_at
      from public.doc_aliases a
      where lower(a.alias) = ${alias}
        and coalesce(a.is_active, true) = true
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

    // Legacy: document_aliases (case-insensitive)
    try {
        const rows = (await sql`
      select
        a.doc_id::text as doc_id,
        null::text as revoked_at,
        a.expires_at::text as expires_at,
        a.password_hash::text as password_hash
      from public.document_aliases a
      where lower(a.alias) = ${alias}
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
 *
 * Robustness goals:
 * - token in email may be 32-hex (no dashes) while DB stores UUID (dashed)
 * - share_tokens primary key column is `token` in your DB
 * - share_tokens view counter column is `views_count`
 */
export async function resolveShareMeta(tokenInput: string): Promise<ShareMeta> {
    const { raw: token, dashed } = tokenVariants(tokenInput);
    if (!token) return { ok: false };

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
      where token = ${token}
        ${dashed ? sql`or token = ${dashed}` : sql``}
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

        const r = rows?.[0];
        if (!r?.token) return { ok: false };

        return {
            ok: true,
            table: "share_tokens",
            shareId: r.token,
            token: r.token,
            docId: r.doc_id,
            toEmail: r.to_email ?? null,
            createdAt: r.created_at,
            expiresAt: r.expires_at ?? null,
            maxViews: r.max_views ?? null,
            viewCount: Number(r.views_count ?? 0),
            revokedAt: r.revoked_at ?? null,
            hasPassword: Boolean(r.password_hash),
            passwordHash: r.password_hash ?? null,
        };
    } catch {
        return { ok: false };
    }
}

/**
 * Token resolution for /raw: increments views atomically while enforcing revoked/expired/max_views.
 * Keeps your current behavior: increments even if password-gated.
 */
/**
 * Token resolution for /raw: NO increment. Used to check existence + gating state and to get doc_id.
 */
async function resolveTokenNoIncrement(
    tokenInput: string
): Promise<
    | { ok: true; docId: string; passwordHash: string | null }
    | { ok: false; error: "NOT_FOUND" | "REVOKED" | "EXPIRED" | "MAXED" }
> {
    const meta = await resolveShareMeta(tokenInput);
    if (!meta.ok) return { ok: false, error: "NOT_FOUND" };
    if (meta.revokedAt) return { ok: false, error: "REVOKED" };
    if (isExpired(meta.expiresAt)) return { ok: false, error: "EXPIRED" };
    if (isMaxed(meta.viewCount ?? 0, meta.maxViews)) return { ok: false, error: "MAXED" };

    return { ok: true, docId: meta.docId, passwordHash: meta.passwordHash ?? null };
}

/**
 * Consume a view for a share token (atomic increment + enforcement).
 * Call this ONLY once you've decided the request is authorized to view.
 */
export async function consumeShareTokenView(
    tokenInput: string
): Promise<
    | { ok: true; docId: string; viewsCount: number }
    | { ok: false; error: "NOT_FOUND" | "REVOKED" | "EXPIRED" | "MAXED" }
> {
    const { raw: token, dashed } = tokenVariants(tokenInput);
    if (!token) return { ok: false, error: "NOT_FOUND" };

    // Atomic: only increments if still valid and below max (unless max_views is null/0)
    try {
        const rows = (await sql`
      update public.share_tokens st
      set views_count = coalesce(st.views_count, 0) + 1
      where (st.token = ${token} ${dashed ? sql`or st.token = ${dashed}` : sql``})
        and st.revoked_at is null
        and (st.expires_at is null or st.expires_at > now())
        and (
          st.max_views is null
          or st.max_views = 0
          or coalesce(st.views_count, 0) < st.max_views
        )
      returning st.doc_id::text as doc_id, coalesce(st.views_count, 0)::int as views_count
    `) as unknown as Array<{ doc_id: string; views_count: number }>;

        const r = rows?.[0];
        if (r?.doc_id) return { ok: true, docId: r.doc_id, viewsCount: Number(r.views_count ?? 0) };
    } catch {
        // fall through to read-only checks
    }

    // If update returned 0 rows, determine why (best-effort)
    const meta = await resolveShareMeta(token);
    if (!meta.ok && dashed) {
        const meta2 = await resolveShareMeta(dashed);
        if (meta2.ok) return consumeShareTokenView(meta2.token);
    }
    const m = meta.ok ? meta : null;
    if (!m) return { ok: false, error: "NOT_FOUND" };
    if (m.revokedAt) return { ok: false, error: "REVOKED" };
    if (isExpired(m.expiresAt)) return { ok: false, error: "EXPIRED" };
    if (isMaxed(m.viewCount ?? 0, m.maxViews)) return { ok: false, error: "MAXED" };

    // Race condition fallback
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

    // TOKEN
    if ("token" in input) {
        const token = String(input.token || "").trim();
        if (!token) return { ok: false, error: "NOT_FOUND" };

        const t = await resolveTokenNoIncrement(token);
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
