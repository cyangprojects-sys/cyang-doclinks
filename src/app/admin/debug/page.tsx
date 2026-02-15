export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";

type DebugResponse =
  | { ok: true; now: string; tables: Record<string, boolean>; env: Record<string, boolean>; alias?: string; alias_row?: any; doc_row?: any; r2_head?: any; notes?: string[] }
  | { ok: false; error: string; message?: string };

function Row({ k, v }: { k: string; v: any }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/10 py-2">
      <div className="text-sm text-white/70">{k}</div>
      <pre className="max-w-[70%] overflow-auto rounded bg-black/40 p-2 text-xs text-white/90">
        {typeof v === "string" ? v : JSON.stringify(v, null, 2)}
      </pre>
    </div>
  );
}

export default async function AdminDebugPage({
  searchParams,
}: {
  searchParams: Promise<{ alias?: string }>;
}) {
  const sp = await searchParams;
  const alias = (sp.alias || "").trim();

  let data: DebugResponse | null = null;
  if (alias) {
    const url = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
    url.pathname = "/api/admin/debug";
    url.searchParams.set("alias", alias);

    const res = await fetch(url.toString(), { cache: "no-store" });
    data = (await res.json().catch(() => null)) as DebugResponse | null;
  }

  return (
    <div className="mx-auto max-w-3xl p-6 text-white">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Admin Debug</h1>
        <Link className="text-sm text-white/70 hover:text-white" href="/admin">
          Back to Admin
        </Link>
      </div>

      <p className="mt-2 text-sm text-white/70">
        This page helps diagnose why a magic link alias or serve redirect is returning 404. It runs on the server and
        calls a protected API route (owner-only).
      </p>

      <form className="mt-6 flex gap-2" action="/admin/debug" method="get">
        <input
          name="alias"
          defaultValue={alias}
          placeholder="alias (e.g. the-mom-test-en-2)"
          className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40"
        />
        <button className="rounded bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90">
          Check
        </button>
      </form>

      {!alias ? (
        <div className="mt-6 rounded-lg border border-white/10 bg-black/30 p-4 text-sm text-white/70">
          Enter an alias above and click <b>Check</b>.
        </div>
      ) : !data ? (
        <div className="mt-6 rounded-lg border border-white/10 bg-black/30 p-4 text-sm text-white/70">Loading…</div>
      ) : !data.ok ? (
        <div className="mt-6 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm">
          <div className="font-semibold text-red-200">Error: {data.error}</div>
          {data.message ? <div className="mt-1 text-red-200/80">{data.message}</div> : null}
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="rounded-lg border border-white/10 bg-black/30 p-4">
            <div className="text-sm font-semibold">Summary</div>
            <div className="mt-2 text-sm text-white/70">
              Alias: <span className="text-white">{data.alias}</span>
            </div>
            <div className="mt-1 text-sm text-white/70">
              Checked at: <span className="text-white">{data.now}</span>
            </div>
            {data.notes?.length ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-white/80">
                {data.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="rounded-lg border border-white/10 bg-black/30 p-4">
            <div className="text-sm font-semibold">Tables detected</div>
            <div className="mt-3">
              {Object.entries(data.tables).map(([k, v]) => (
                <Row key={k} k={k} v={v} />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/30 p-4">
            <div className="text-sm font-semibold">Env vars present (boolean only)</div>
            <div className="mt-3">
              {Object.entries(data.env).map(([k, v]) => (
                <Row key={k} k={k} v={v} />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/30 p-4">
            <div className="text-sm font-semibold">Alias row</div>
            <div className="mt-3">
              <Row k="public.doc_aliases row" v={data.alias_row ?? null} />
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/30 p-4">
            <div className="text-sm font-semibold">Document row</div>
            <div className="mt-3">
              <Row k="doc row" v={data.doc_row ?? null} />
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/30 p-4">
            <div className="text-sm font-semibold">R2 HEAD (best-effort)</div>
            <div className="mt-3">
              <Row k="head" v={data.r2_head ?? null} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
