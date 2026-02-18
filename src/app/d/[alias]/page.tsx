// src/app/d/[alias]/page.tsx
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import ShareForm from "./ShareForm";
import AliasPasswordGate from "./AliasPasswordGate";
import { resolveDoc } from "@/lib/resolveDoc";

import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { sql } from "@/lib/db";
import { cookies } from "next/headers";
import { aliasTrustCookieName, isAliasTrusted } from "@/lib/deviceTrust";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function isOwner(): Promise<boolean> {
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
 * Owner-bypass alias resolution (gets doc_id without enforcing password).
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
        a.expires_at::text as expires_at
      from public.document_aliases a
      where lower(a.alias) = ${alias}
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
      };
    }
  } catch {
    // ignore
  }

  return { ok: false };
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

  const owner = await isOwner();

  // Owner bypass stays: owner can always view regardless of alias password.
  if (owner) {
    const bypass = await resolveAliasDocIdBypass(alias);
    if (!bypass.ok) notFound();
    if (bypass.revokedAt) notFound();
    if (isExpired(bypass.expiresAt)) notFound();

    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <ShareForm docId={bypass.docId} />
        <DocumentViewer docId={bypass.docId} />
      </main>
    );
  }

  // Public viewer: handle alias password + device trust cookie (8h)
  const row = await resolveAliasRow(alias);
  if (!row.ok) notFound();
  if (row.revokedAt) notFound();
  if (isExpired(row.expiresAt)) notFound();

  if (row.passwordHash) {
    const c = await cookies();
    const v = c.get(aliasTrustCookieName(alias))?.value;
    const unlocked = isAliasTrusted(alias, v);

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

  const resolved = await resolveDoc({ docId: row.docId });
  if (!resolved.ok) notFound();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <DocumentViewer docId={resolved.docId} />
    </main>
  );
}

function DocumentViewer({ docId }: { docId: string }) {
  const viewerUrl = `/serve/${docId}`;

  return (
    <div className="mt-4">
      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
        <iframe
          title="Document viewer"
          src={viewerUrl}
          className="block h-[78vh] w-full border-0 bg-transparent"
          allow="fullscreen"
        />
      </div>

      <div className="mt-3 text-xs text-neutral-400">
        If the viewer doesn’t load,{" "}
        <a
          href={viewerUrl}
          target="_blank"
          rel="noreferrer"
          className="text-neutral-200 underline"
        >
          open the document in a new tab
        </a>
        .
      </div>
    </div>
  );
}
