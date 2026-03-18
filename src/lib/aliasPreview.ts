import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { sql } from "@/lib/db";
import { allowUnencryptedServing } from "@/lib/securityPolicy";
import { evaluateDocumentAvailability, type DocumentAvailabilitySnapshot } from "@/lib/documentAvailability";

export async function isOwnerEmail(): Promise<boolean> {
  const owner = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
  if (!owner) return false;

  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").trim().toLowerCase();

  return !!email && email === owner;
}

export async function resolveAliasDocIdBypass(alias: string): Promise<
  | { ok: true; docId: string; revokedAt: string | null; expiresAt: string | null }
  | { ok: false }
> {
  try {
    const rows = (await sql`
      select
        a.doc_id::text as doc_id,
        a.revoked_at::text as revoked_at,
        a.expires_at::text as expires_at,
        coalesce(a.is_active, true) as is_active
      from public.doc_aliases a
      where lower(a.alias) = ${alias}
      limit 1
    `) as unknown as Array<{
      doc_id: string;
      revoked_at: string | null;
      expires_at: string | null;
      is_active: boolean;
    }>;

    if (rows?.length) {
      if (!rows[0].is_active) return { ok: false };
      return {
        ok: true,
        docId: rows[0].doc_id,
        revokedAt: rows[0].revoked_at ?? null,
        expiresAt: rows[0].expires_at ?? null,
      };
    }
  } catch {
    // ignore; fall through to legacy table
  }

  try {
    const rows = (await sql`
      select
        a.doc_id::text as doc_id,
        null::text as revoked_at,
        a.expires_at::text as expires_at,
        true as is_active
      from public.document_aliases a
      where lower(a.alias) = ${alias}
      limit 1
    `) as unknown as Array<{
      doc_id: string;
      revoked_at: string | null;
      expires_at: string | null;
      is_active: boolean;
    }>;

    if (rows?.length) {
      if (!rows[0].is_active) return { ok: false };
      return {
        ok: true,
        docId: rows[0].doc_id,
        revokedAt: rows[0].revoked_at ?? null,
        expiresAt: rows[0].expires_at ?? null,
      };
    }
  } catch {
    // ignore
  }

  return { ok: false };
}

export async function userOwnsDoc(userId: string, docId: string): Promise<boolean> {
  try {
    const rows = (await sql`
      select 1
      from public.docs
      where id = ${docId}::uuid
        and owner_id = ${userId}::uuid
      limit 1
    `) as unknown as Array<{ "?column?": number }>;

    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function getDocAvailabilityHint(docId: string): Promise<DocumentAvailabilitySnapshot> {
  try {
    const rows = (await sql`
      select
        coalesce(encryption_enabled, false) as encryption_enabled,
        coalesce(moderation_status::text, 'active') as moderation_status,
        coalesce(scan_status::text, 'unscanned') as scan_status,
        coalesce(status::text, 'ready') as status,
        nullif(coalesce(r2_key::text, ''), '') as r2_key,
        coalesce(o.disabled, false) as org_disabled,
        coalesce(o.is_active, true) as org_active
      from public.docs
      left join public.organizations o on o.id = public.docs.org_id
      where id = ${docId}::uuid
      limit 1
    `) as unknown as Array<{
      encryption_enabled: boolean;
      moderation_status: string;
      scan_status: string;
      status: string;
      r2_key: string | null;
      org_disabled: boolean;
      org_active: boolean;
    }>;
    return evaluateDocumentAvailability(rows?.[0] ?? null, {
      allowUnencryptedServing: allowUnencryptedServing(),
    });
  } catch {
    try {
      const rows = (await sql`
        select
          coalesce(encryption_enabled, false) as encryption_enabled,
          coalesce(moderation_status::text, 'active') as moderation_status,
          coalesce(scan_status::text, 'unscanned') as scan_status,
          coalesce(status::text, 'ready') as status,
          nullif(coalesce(r2_key::text, ''), '') as r2_key
        from public.docs
        where id = ${docId}::uuid
        limit 1
      `) as unknown as Array<{
        encryption_enabled: boolean;
        moderation_status: string;
        scan_status: string;
        status: string;
        r2_key: string | null;
      }>;
      return evaluateDocumentAvailability(rows?.[0] ?? null, {
        allowUnencryptedServing: allowUnencryptedServing(),
      });
    } catch {
      return evaluateDocumentAvailability(null, {
        allowUnencryptedServing: allowUnencryptedServing(),
      });
    }
  }
}
