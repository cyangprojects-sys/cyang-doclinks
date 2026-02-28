// src/app/d/[alias]/page.tsx
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import ShareForm from "./ShareForm";
import AliasPasswordGate from "./AliasPasswordGate";
import { resolveDoc } from "@/lib/resolveDoc";

import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { sql } from "@/lib/db";
import { isAliasUnlockedAction } from "./unlockActions";
import { getAuthedUser, roleAtLeast } from "@/lib/authz";
import { allowUnencryptedServing } from "@/lib/securityPolicy";
import SecurePdfCanvasViewer from "@/app/components/SecurePdfCanvasViewer";
import { detectFileFamily, fileFamilyLabel } from "@/lib/fileFamily";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function isOwnerEmail(): Promise<boolean> {
  const owner = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
  if (!owner) return false;

  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").trim().toLowerCase();

  return !!email && email === owner;
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  return Number.isFinite(t) && t <= Date.now();
}

/**
 * Privileged-bypass alias resolution (gets doc_id without enforcing password).
 * Supports both `doc_aliases` (new) and `document_aliases` (legacy).
 */
async function resolveAliasDocIdBypass(alias: string): Promise<
  | { ok: true; docId: string; revokedAt: string | null; expiresAt: string | null }
  | { ok: false }
> {
  // New table: doc_aliases
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

  // Legacy table: document_aliases
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

async function userOwnsDoc(userId: string, docId: string): Promise<boolean> {
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

async function getDocAvailabilityHint(docId: string): Promise<string | null> {
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

    const r = rows?.[0];
    if (!r) return null;

    if ((r.status || "").toLowerCase() === "deleted") {
      return "This document is deleted and unavailable.";
    }
    if (r.org_disabled === true || r.org_active === false) {
      return "This organization is disabled, so document serving is unavailable.";
    }
    if (!r.r2_key) {
      return "Document storage pointer is missing. Re-upload this document.";
    }

    if (!r.encryption_enabled && !allowUnencryptedServing()) {
      return "This is a legacy unencrypted upload. Serving is blocked by policy. Re-upload or migrate this document to encrypted storage.";
    }

    const moderation = String(r.moderation_status || "active").toLowerCase();
    if (moderation === "quarantined") return "This document is quarantined and cannot be served.";
    if (moderation === "disabled" || moderation === "deleted") return `This document is ${moderation} and unavailable.`;

    const scan = String(r.scan_status || "unscanned").toLowerCase();
    if (scan !== "clean") {
      return `Serving is blocked due to scan status: ${r.scan_status}. File must be clean before it can be viewed or downloaded.`;
    }
  } catch {
    // ignore
  }
  return null;
}

async function getDocViewMeta(docId: string): Promise<{ contentType: string | null; filename: string | null }> {
  try {
    const rows = (await sql`
      select
        coalesce(content_type::text, '') as content_type,
        coalesce(original_filename::text, '') as original_filename
      from public.docs
      where id = ${docId}::uuid
      limit 1
    `) as unknown as Array<{ content_type: string; original_filename: string }>;
    const ct = String(rows?.[0]?.content_type || "").trim();
    const name = String(rows?.[0]?.original_filename || "").trim();
    return { contentType: ct || null, filename: name || null };
  } catch {
    return { contentType: null, filename: null };
  }
}

/**
 * Fetch alias row including password_hash (for public password gate).
 */
async function resolveAliasRow(alias: string): Promise<
  | {
    ok: true;
    docId: string;
    revokedAt: string | null;
    expiresAt: string | null;
    passwordHash: string | null;
  }
  | { ok: false }
> {
  // New table: doc_aliases
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
      return {
        ok: true,
        docId: rows[0].doc_id,
        revokedAt: rows[0].revoked_at ?? null,
        expiresAt: rows[0].expires_at ?? null,
        passwordHash: rows[0].password_hash ?? null,
      };
    }
  } catch {
    // ignore; fall through to legacy
  }

  // Compatibility fallback when doc_aliases.password_hash is absent.
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
      return {
        ok: true,
        docId: rows[0].doc_id,
        revokedAt: rows[0].revoked_at ?? null,
        expiresAt: rows[0].expires_at ?? null,
        passwordHash: null,
      };
    }
  } catch {
    // ignore; fall through to legacy
  }

  // Legacy table: document_aliases
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
      return {
        ok: true,
        docId: rows[0].doc_id,
        revokedAt: rows[0].revoked_at ?? null,
        expiresAt: rows[0].expires_at ?? null,
        passwordHash: rows[0].password_hash ?? null,
      };
    }
  } catch {
    // ignore
  }

  return { ok: false };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ alias: string }>;
}) {
  noStore();

  const { alias: rawAlias } = await params;
  const alias = decodeURIComponent(rawAlias || "").trim().toLowerCase();
  if (!alias) notFound();

  // Privileged bypass:
  // - OWNER_EMAIL always bypasses
  // - signed-in admin/owner bypasses
  // - signed-in viewer bypasses for docs they own
  const bypass = await resolveAliasDocIdBypass(alias);
  if (!bypass.ok) notFound();

  const ownerEmail = await isOwnerEmail();
  const u = await getAuthedUser();

  const isPrivileged =
    ownerEmail ||
    (u ? roleAtLeast(u.role, "admin") || (await userOwnsDoc(u.id, bypass.docId)) : false);

  if (isPrivileged) {
    const availabilityHint = await getDocAvailabilityHint(bypass.docId);
    const viewMeta = await getDocViewMeta(bypass.docId);
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <ShareForm docId={bypass.docId} />
        <DocumentViewer alias={alias} contentType={viewMeta.contentType} filename={viewMeta.filename} availabilityHint={availabilityHint} />
      </main>
    );
  }

  // Public viewer: handle alias password + device trust cookie (8h)
  const row = await resolveAliasRow(alias);
  if (!row.ok) notFound();
  if (row.revokedAt) notFound();
  if (isExpired(row.expiresAt)) notFound();

  if (row.passwordHash) {
    const unlocked = await isAliasUnlockedAction(alias);

    if (!unlocked) {
      return (
        <main className="mx-auto max-w-lg px-4 py-12">
          <h1 className="text-xl font-semibold">Protected link</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Enter the password to view this document. We’ll remember this device for 8 hours.
          </p>
          <AliasPasswordGate alias={alias} />
        </main>
      );
    }
  }

  // Password gating (if any) has already been enforced above.
  // Resolve by docId so password-protected aliases can render after unlock.
  const resolved = await resolveDoc({ docId: row.docId });
  if (!resolved.ok) notFound();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <DocumentViewer alias={alias} contentType={resolved.contentType} filename={null} />
    </main>
  );
}

function DocumentViewer({
  alias,
  contentType,
  filename,
  availabilityHint,
}: {
  alias: string;
  contentType?: string | null;
  filename?: string | null;
  availabilityHint?: string | null;
}) {
  const viewerUrl = `/d/${encodeURIComponent(alias)}/raw`;
  const downloadUrl = `/d/${encodeURIComponent(alias)}/raw?disposition=attachment`;
  const family = detectFileFamily({ contentType, filename });
  const typeLabel = fileFamilyLabel(family);
  const isArchive = family === "archive";

  return (
    <div className="mt-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-white/80">
        <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 font-semibold tracking-wide">
          {typeLabel}
        </span>
        {contentType ? (
          <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 font-mono text-[11px] text-white/70">
            {contentType}
          </span>
        ) : null}
      </div>
      {availabilityHint ? (
        <div className="mb-3 rounded-lg border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          {availabilityHint}
        </div>
      ) : null}
      {!availabilityHint ? (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
          {isArchive ? (
            <div className="m-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              <div className="font-semibold">Archive files are download-only.</div>
              <div className="mt-1 text-amber-100/85">Inline viewing is disabled for archive content.</div>
              <a
                href={downloadUrl}
                className="mt-3 inline-flex items-center rounded-lg border border-amber-200/40 bg-amber-100/10 px-3 py-2 text-sm text-amber-50 hover:bg-amber-100/20"
              >
                Download archive
              </a>
            </div>
          ) : (
            <SecurePdfCanvasViewer
              rawUrl={viewerUrl}
              downloadUrl={downloadUrl}
              mimeType={contentType}
              filename={filename}
              className="h-[78vh]"
            />
          )}
        </div>
      ) : null}

      <div className="mt-3 text-xs text-neutral-400">
        <a href={`/report?alias=${encodeURIComponent(alias)}`} className="text-neutral-200 underline">
          Report abuse
        </a>
      </div>
    </div>
  );
}
