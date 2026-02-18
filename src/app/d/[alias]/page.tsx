// src/app/d/[alias]/page.tsx
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import ShareForm from "./ShareForm";
import { resolveDoc } from "@/lib/resolveDoc";

import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { sql } from "@/lib/db";

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

  const resolved = await resolveDoc({ alias });

  if (!resolved.ok) {
    // ✅ Owner bypass: allow viewing even if password-protected
    if (resolved.error === "PASSWORD_REQUIRED" && owner) {
      const bypass = await resolveAliasDocIdBypass(alias);
      if (!bypass.ok) notFound();
      if (bypass.revokedAt) notFound();
      if (isExpired(bypass.expiresAt)) notFound();

      return (
        <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
          <ShareForm docId={bypass.docId} />
          <DocumentViewer docId={bypass.docId} />
        </div>
      );
    }

    // Non-owner behavior unchanged
    if (resolved.error === "PASSWORD_REQUIRED") {
      return (
        <div style={{ padding: 24, color: "white" }}>
          This link is password-protected.
        </div>
      );
    }

    notFound();
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <ShareForm docId={resolved.docId} />
      <DocumentViewer docId={resolved.docId} />
    </div>
  );
}

function DocumentViewer({ docId }: { docId: string }) {
  const viewerUrl = `/serve/${docId}`;

  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          overflow: "hidden",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <iframe
          title="Document viewer"
          src={viewerUrl}
          style={{
            width: "100%",
            height: "78vh",
            border: 0,
            display: "block",
            background: "transparent",
          }}
          allow="fullscreen"
        />
      </div>

      <div style={{ marginTop: 10, fontSize: 13, opacity: 0.8, color: "white" }}>
        If the viewer doesn’t load,{" "}
        <a
          href={viewerUrl}
          target="_blank"
          rel="noreferrer"
          style={{ color: "white", textDecoration: "underline" }}
        >
          open the document in a new tab
        </a>
        .
      </div>
    </div>
  );
}
