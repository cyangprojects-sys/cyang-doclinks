// src/app/s/[token]/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { isShareUnlockedAction, verifySharePasswordAction } from "./actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getShareMeta(token: string) {
    // Prefer doc_shares; fallback to share_tokens
    try {
        const rows = (await sql`
      select
        token::text as token,
        to_email,
        created_at::text as created_at,
        expires_at::text as expires_at,
        max_views,
        view_count,
        revoked_at::text as revoked_at,
        (password_hash is not null) as has_password
      from public.doc_shares
      where token = ${token}
      limit 1
    `) as unknown as Array<{
            token: string;
            to_email: string | null;
            created_at: string;
            expires_at: string | null;
            max_views: number | null;
            view_count: number | null;
            revoked_at: string | null;
            has_password: boolean;
        }>;
        if (rows?.length) return { ok: true as const, table: "doc_shares" as const, ...rows[0] };
    } catch {
        // ignore
    }

    try {
        const rows = (await sql`
      select
        token::text as token,
        to_email,
        created_at::text as created_at,
        expires_at::text as expires_at,
        max_views,
        views_count,
        revoked_at::text as revoked_at,
        (password_hash is not null) as has_password
      from public.share_tokens
      where token::text = ${token}
         or token = ${token}
      limit 1
    `) as unknown as Array<{
            token: string;
            to_email: string | null;
            created_at: string;
            expires_at: string | null;
            max_views: number | null;
            views_count: number | null;
            revoked_at: string | null;
            has_password: boolean;
        }>;
        if (rows?.length) {
            const r = rows[0];
            return {
                ok: true as const,
                table: "share_tokens" as const,
                token: r.token,
                to_email: r.to_email,
                created_at: r.created_at,
                expires_at: r.expires_at,
                max_views: r.max_views,
                view_count: Number(r.views_count ?? 0),
                revoked_at: r.revoked_at,
                has_password: r.has_password,
            };
        }
    } catch {
        // ignore
    }

    return { ok: false as const };
}

function fmtDate(s: string | null) {
    if (!s) return "—";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString();
}

function isExpired(expires_at: string | null) {
    if (!expires_at) return false;
    return new Date(expires_at).getTime() <= Date.now();
}

function isMaxed(view_count: number, max_views: number | null) {
    if (max_views === null) return false;
    if (max_views === 0) return false;
    return view_count >= max_views;
}

export default async function ShareTokenPage(props: { params: Promise<{ token: string }> }) {
    const { token } = await props.params;
    const t = (token || "").trim();
    if (!t) redirect("/");

    const meta = await getShareMeta(t);
    if (!meta.ok) {
        return (
            <main className="mx-auto max-w-lg px-4 py-12">
                <h1 className="text-xl font-semibold">Not found</h1>
                <p className="mt-2 text-sm text-neutral-400">This share link doesn’t exist.</p>
                <div className="mt-6">
                    <Link href="/" className="text-blue-400 hover:underline">
                        Go home
                    </Link>
                </div>
            </main>
        );
    }

    if (meta.revoked_at) {
        return (
            <main className="mx-auto max-w-lg px-4 py-12">
                <h1 className="text-xl font-semibold">Link revoked</h1>
                <p className="mt-2 text-sm text-neutral-400">This share link has been revoked.</p>
            </main>
        );
    }

    if (isExpired(meta.expires_at)) {
        return (
            <main className="mx-auto max-w-lg px-4 py-12">
                <h1 className="text-xl font-semibold">Link expired</h1>
                <p className="mt-2 text-sm text-neutral-400">This share link has expired.</p>
            </main>
        );
    }

    if (isMaxed(meta.view_count ?? 0, meta.max_views)) {
        return (
            <main className="mx-auto max-w-lg px-4 py-12">
                <h1 className="text-xl font-semibold">View limit reached</h1>
                <p className="mt-2 text-sm text-neutral-400">This share link has reached its max views.</p>
            </main>
        );
    }

    // If already unlocked, go straight to raw stream
    const unlocked = await isShareUnlockedAction(t);
    if (unlocked) redirect(`/s/${encodeURIComponent(t)}/raw`);

    // If no password is set, we still want to create an unlock session + cookie so /raw gating is consistent.
    if (!meta.has_password) {
        // POST via Server Action to set cookie + DB, then redirect.
        // Easiest: render a tiny auto-submit form.
        return (
            <main className="mx-auto max-w-lg px-4 py-12">
                <h1 className="text-xl font-semibold">Opening…</h1>
                <p className="mt-2 text-sm text-neutral-400">Just a moment.</p>

                <form
                    action={async (fd) => {
                        "use server";
                        fd.set("token", t);
                        fd.set("password", "");
                        await verifySharePasswordAction(fd);
                        redirect(`/s/${encodeURIComponent(t)}/raw`);
                    }}
                >
                    <input type="hidden" name="token" value={t} />
                    <input type="hidden" name="password" value="" />
                    <button className="mt-6 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200">
                        Continue
                    </button>
                </form>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-lg px-4 py-12">
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-6">
                <h1 className="text-xl font-semibold tracking-tight">Password required</h1>
                <p className="mt-2 text-sm text-neutral-400">
                    Enter the password to view this document. Once unlocked, it stays unlocked for 8 hours on this browser.
                </p>

                <div className="mt-5 grid grid-cols-2 gap-3 text-xs text-neutral-400">
                    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                        <div className="text-neutral-500">Created</div>
                        <div className="mt-1 text-neutral-200">{fmtDate(meta.created_at)}</div>
                    </div>
                    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                        <div className="text-neutral-500">Expires</div>
                        <div className="mt-1 text-neutral-200">{fmtDate(meta.expires_at)}</div>
                    </div>
                </div>

                <form
                    action={async (fd) => {
                        "use server";
                        const res = await verifySharePasswordAction(fd);
                        if (res.ok) redirect(`/s/${encodeURIComponent(t)}/raw`);
                        // If bad password / rate limited, we re-render by throwing message into query string:
                        redirect(`/s/${encodeURIComponent(t)}?e=${encodeURIComponent(res.message)}`);
                    }}
                    className="mt-6"
                >
                    <input type="hidden" name="token" value={t} />
                    <label className="block text-xs text-neutral-400">Password</label>
                    <input
                        name="password"
                        type="password"
                        autoFocus
                        className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-neutral-600"
                        placeholder="Enter password"
                    />

                    <button
                        type="submit"
                        className="mt-3 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:bg-neutral-800"
                    >
                        Unlock
                    </button>

                    <p className="mt-3 text-xs text-neutral-500">
                        Having trouble? Ask the sender to resend the link or confirm the password.
                    </p>
                </form>
            </div>
        </main>
    );
}
