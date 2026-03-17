import { sql } from "@/lib/db";

const TOKEN_MAX_LEN = 128;

export type ShareGateMeta =
  | {
      ok: true;
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
      watermarkEnabled: boolean;
      watermarkText: string | null;
      allowDownload: boolean;
      packId: string | null;
      packVersion: number | null;
      sharedByEmail: string | null;
      docStatus: string;
      docModerationStatus: string;
      scanStatus: string;
      riskLevel: string;
      isActive: boolean;
    }
  | { ok: false };

function tokenVariants(tokenInput: string): { raw: string; dashed: string | null } {
  const raw = String(tokenInput || "").trim();
  if (raw.length > TOKEN_MAX_LEN) return { raw: "", dashed: null };
  if (!raw) return { raw: "", dashed: null };

  const isDashedUuid = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(raw);
  if (isDashedUuid) return { raw: raw.toLowerCase(), dashed: raw.toLowerCase() };

  const isHex32 = /^[a-fA-F0-9]{32}$/.test(raw);
  if (!isHex32) return { raw, dashed: null };

  const lower = raw.toLowerCase();
  const dashed = `${lower.slice(0, 8)}-${lower.slice(8, 12)}-${lower.slice(12, 16)}-${lower.slice(16, 20)}-${lower.slice(20)}`;
  return { raw: lower, dashed };
}

export async function resolveShareGateMeta(tokenInput: string): Promise<ShareGateMeta> {
  const { raw: token, dashed } = tokenVariants(tokenInput);
  if (!token) return { ok: false };

  try {
    const rows = (dashed
      ? await sql`
      select
        st.token::text as token,
        st.doc_id::text as doc_id,
        st.to_email,
        st.created_at::text as created_at,
        st.expires_at::text as expires_at,
        st.max_views,
        st.views_count,
        st.revoked_at::text as revoked_at,
        st.password_hash,
        coalesce(st.watermark_enabled, false) as watermark_enabled,
        st.watermark_text,
        coalesce(st.allow_download, true) as allow_download,
        st.pack_id::text as pack_id,
        st.pack_version::int as pack_version,
        coalesce(d.status::text, 'ready') as doc_status,
        coalesce(d.moderation_status::text, 'active') as doc_moderation_status,
        coalesce(d.scan_status::text, 'unscanned') as scan_status,
        coalesce(d.risk_level::text, 'low') as risk_level,
        coalesce(st.is_active, true) as is_active
      from public.share_tokens st
      left join public.docs d on d.id = st.doc_id
      where st.token = ${token} or st.token = ${dashed}
      limit 1
    `
      : await sql`
      select
        st.token::text as token,
        st.doc_id::text as doc_id,
        st.to_email,
        st.created_at::text as created_at,
        st.expires_at::text as expires_at,
        st.max_views,
        st.views_count,
        st.revoked_at::text as revoked_at,
        st.password_hash,
        coalesce(st.watermark_enabled, false) as watermark_enabled,
        st.watermark_text,
        coalesce(st.allow_download, true) as allow_download,
        st.pack_id::text as pack_id,
        st.pack_version::int as pack_version,
        coalesce(d.status::text, 'ready') as doc_status,
        coalesce(d.moderation_status::text, 'active') as doc_moderation_status,
        coalesce(d.scan_status::text, 'unscanned') as scan_status,
        coalesce(d.risk_level::text, 'low') as risk_level,
        coalesce(st.is_active, true) as is_active
      from public.share_tokens st
      left join public.docs d on d.id = st.doc_id
      where st.token = ${token}
      limit 1
    `) as unknown as Array<{
      token: string;
      doc_id: string;
      to_email: string | null;
      created_at: string | null;
      expires_at: string | null;
      max_views: number | null;
      views_count: number | null;
      revoked_at: string | null;
      password_hash: string | null;
      watermark_enabled: boolean;
      watermark_text: string | null;
      allow_download: boolean;
      pack_id: string | null;
      pack_version: number | null;
      doc_status: string;
      doc_moderation_status: string;
      scan_status: string;
      risk_level: string;
      is_active: boolean;
    }>;
    const row = rows?.[0];
    if (!row?.token || !row.is_active) return { ok: false };
    return {
      ok: true,
      token: row.token,
      docId: row.doc_id,
      toEmail: row.to_email ?? null,
      createdAt: row.created_at ?? new Date(0).toISOString(),
      expiresAt: row.expires_at ?? null,
      maxViews: row.max_views ?? null,
      viewCount: Number(row.views_count ?? 0),
      revokedAt: row.revoked_at ?? null,
      hasPassword: Boolean(row.password_hash),
      passwordHash: row.password_hash ?? null,
      watermarkEnabled: Boolean(row.watermark_enabled),
      watermarkText: row.watermark_text ?? null,
      allowDownload: Boolean(row.allow_download),
      packId: row.pack_id ?? null,
      packVersion: row.pack_version ?? null,
      sharedByEmail: null,
      docStatus: row.doc_status ?? "ready",
      docModerationStatus: row.doc_moderation_status ?? "active",
      scanStatus: row.scan_status ?? "unscanned",
      riskLevel: row.risk_level ?? "low",
      isActive: true,
    };
  } catch {
    try {
      const rows = (dashed
        ? await sql`
        select
          st.token::text as token,
          st.doc_id::text as doc_id,
          st.to_email,
          st.created_at::text as created_at,
          st.expires_at::text as expires_at,
          st.max_views,
          st.views_count,
          st.revoked_at::text as revoked_at,
          st.password_hash,
          coalesce(st.watermark_enabled, false) as watermark_enabled,
          st.watermark_text,
          coalesce(st.allow_download, true) as allow_download,
          st.pack_id::text as pack_id,
          st.pack_version::int as pack_version,
          coalesce(d.status::text, 'ready') as doc_status,
          coalesce(d.moderation_status::text, 'active') as doc_moderation_status,
          coalesce(d.scan_status::text, 'unscanned') as scan_status,
          coalesce(d.risk_level::text, 'low') as risk_level
        from public.share_tokens st
        left join public.docs d on d.id = st.doc_id
        where st.token = ${token} or st.token = ${dashed}
        limit 1
      `
        : await sql`
        select
          st.token::text as token,
          st.doc_id::text as doc_id,
          st.to_email,
          st.created_at::text as created_at,
          st.expires_at::text as expires_at,
          st.max_views,
          st.views_count,
          st.revoked_at::text as revoked_at,
          st.password_hash,
          coalesce(st.watermark_enabled, false) as watermark_enabled,
          st.watermark_text,
          coalesce(st.allow_download, true) as allow_download,
          st.pack_id::text as pack_id,
          st.pack_version::int as pack_version,
          coalesce(d.status::text, 'ready') as doc_status,
          coalesce(d.moderation_status::text, 'active') as doc_moderation_status,
          coalesce(d.scan_status::text, 'unscanned') as scan_status,
          coalesce(d.risk_level::text, 'low') as risk_level
        from public.share_tokens st
        left join public.docs d on d.id = st.doc_id
        where st.token = ${token}
        limit 1
      `) as unknown as Array<{
        token: string;
        doc_id: string;
        to_email: string | null;
        created_at: string | null;
        expires_at: string | null;
        max_views: number | null;
        views_count: number | null;
        revoked_at: string | null;
        password_hash: string | null;
        watermark_enabled: boolean;
        watermark_text: string | null;
        allow_download: boolean;
        pack_id: string | null;
        pack_version: number | null;
        doc_status: string;
        doc_moderation_status: string;
        scan_status: string;
        risk_level: string;
      }>;
      const row = rows?.[0];
      if (!row?.token) return { ok: false };
      return {
        ok: true,
        token: row.token,
        docId: row.doc_id,
        toEmail: row.to_email ?? null,
        createdAt: row.created_at ?? new Date(0).toISOString(),
        expiresAt: row.expires_at ?? null,
        maxViews: row.max_views ?? null,
        viewCount: Number(row.views_count ?? 0),
        revokedAt: row.revoked_at ?? null,
        hasPassword: Boolean(row.password_hash),
        passwordHash: row.password_hash ?? null,
        watermarkEnabled: Boolean(row.watermark_enabled),
        watermarkText: row.watermark_text ?? null,
        allowDownload: Boolean(row.allow_download),
        packId: row.pack_id ?? null,
        packVersion: row.pack_version ?? null,
        sharedByEmail: null,
        docStatus: row.doc_status ?? "ready",
        docModerationStatus: row.doc_moderation_status ?? "active",
        scanStatus: row.scan_status ?? "unscanned",
        riskLevel: row.risk_level ?? "low",
        isActive: true,
      };
    } catch {
      return { ok: false };
    }
  }
}
