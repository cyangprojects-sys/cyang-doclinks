// src/app/d/[alias]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { sql } from "@/lib/db";
import ShareForm from "./ShareForm";
import { isOwnerAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DocResolvedRow = {
  doc_id: string;
  is_public: boolean;
  title: string | null;
};

type ShareOkRow = { ok: boolean };

async function resolveDocByAlias(alias: string): Promise<DocResolvedRow | null> {
  const rows = (await sql`
    select
      d.id::text as doc_id,
      d.is_public as is_public,
      d.title as title
    from public.doc_aliases a
    join public.docs d on d.id = a.doc_id
    where a.alias = ${alias}
      and a.revoked_at is null
      and (a.expires_at is null or a.expires_at > now())
    limit 1
  `) as unknown as DocResolvedRow[];

  return rows?.[0] || null;
}

async function tokenAllowsDoc(docId: string, token: string): Promise<boolean> {
  const rows = (await sql`
    select true as ok
    from public.doc_shares s
    where s.doc_id = ${docId}::uuid
      and s.token = ${token}
      and s.revoked_at is null
      and (s.expires_at is null or s.expires_at > now())
      and (
        s.max_views is null
        or s.max_views = 0
        or s.view_count <= s.max_views
      )
    limit 1
  `) as unknown as ShareOkRow[];

  return !!rows?.[0]?.ok;
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ alias: string }>;
}) {
  const p = await params;
  const alias = decodeURIComponent(p.alias || "").trim();
  if (!alias) notFound();

  const resolved = await resolveDocByAlias(alias);
  if (!resolved?.doc_id) notFound();

  const docId = resolved.doc_id;
  const title = resolved.title || "Shared document";

  // Viewer gate: public OR valid share-token cookie
  let allowed = !!resolved.is_public;

  if (!allowed) {
    const cookieStore = await cookies();
    const token = cookieStore.get("cyang_share")?.value || "";
    if (token) {
      allowed = await tokenAllowsDoc(docId, token);
    }
  }

  if (!allowed) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Access required</h1>
          <Link
            href="/"
            className="text-sm text-neutral-400 hover:text-neutral-200 underline underline-offset-4"
          >
            Home
          </Link>
        </div>

        <p className="mt-3 text-sm text-neutral-300">
          This document requires a valid share link. Open the email link again to
          regain access on this device.
        </p>
      </main>
    );
  }

  const owner = await isOwnerAdmin();

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <Link
          href="/"
          className="text-sm text-neutral-400 hover:text-neutral-200 underline underline-offset-4"
        >
          Home
        </Link>
      </div>

      <p className="mt-2 text-sm text-neutral-400">
        Link: <span className="font-mono text-neutral-300">/d/{alias}</span>
      </p>

      {owner ? (
        <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
          <ShareForm alias={alias} />
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
          <div className="text-sm text-neutral-300">
            Sharing controls are owner-only.
          </div>
          <div className="mt-2">
            <Link
              href="/api/auth/signin"
              className="text-sm text-neutral-400 hover:text-neutral-200 underline underline-offset-4"
            >
              Sign in
            </Link>
          </div>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-lg border border-neutral-800">
        <iframe
          title="Document"
          src={`/d/${encodeURIComponent(alias)}/raw`}
          className="h-[80vh] w-full"
        />
      </div>
    </main>
  );
}
