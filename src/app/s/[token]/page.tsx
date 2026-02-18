// src/app/s/[token]/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { isShareUnlockedAction, verifySharePasswordAction } from "./actions";
import { resolveShareMeta } from "@/lib/resolveDoc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export default async function ShareTokenPage(props: {
    params: Promise<{ token: string }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { token } = await props.params;
    const sp = (await props.searchParams) || {};
    const errorParam = sp.error;
    const errorText = Array.isArray(errorParam) ? errorParam[0] : errorParam;

    const t = (token || "").trim();
    if (!t) redirect("/");

    const meta = await resolveShareMeta(t);
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

    if (meta.revokedAt) {
        return (
            <main className="mx-auto max-w-lg px-4 py-12">
                <h1 className="text-xl font-semibold">Link revoked</h1>
                <p className="mt-2 text-sm text-neutral-400">This share link has been revoked.</p>
            </main>
        );
    }

    if (isExpired(meta.expiresAt)) {
        return (
            <main className="mx-auto max-w-lg px-4 py-12">
                <h1 className="text-xl font-semibold">Link expired</h1>
                <p className="mt-2 text-sm text-neutral-400">This share link has expired.</p>
            </main>
        );
    }

    if (isMaxed(meta.viewCount ?? 0, meta.maxViews)) {
        return (
            <main className="mx-auto max-w-lg px-4 py-12">
                <h1 className="text-xl font-semibold">View limit reached</h1>
                <p className="mt-2 text-sm text-neutral-400">This share link has reached its max views.</p>
            </main>
        );
    }

    const unlocked = await isShareUnlockedAction(t);
    if (unlocked) redirect(`/s/${encodeURIComponent(t)}/raw`);

    // If no password, show Continue that triggers the action (action will redirect to /raw)
    if (!meta.hasPassword) {
        return (
            <main className="mx-auto max-w-lg px-4 py-12">
                {errorText ? (
                    <div className="mb-4 rounded-md border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
                        {errorText}
                    </div>
                ) : null}

                <form action={verifySharePasswordAction}>
                    <input type="hidden" name="token" value={t} />
                    <input type="hidden" name="password" value="" />
                    <button
                        type="submit"
                        className="rounded-md bg-neutral-800 px-4 py-2 text-sm text-neutral-100 hover:bg-neutral-700"
                    >
                        Continue
                    </button>
                </form>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-lg px-4 py-12">
            <h1 className="text-xl font-semibold">Protected link</h1>
            <p className="mt-2 text-sm text-neutral-400">This share requires a password.</p>

            {errorText ? (
                <div className="mt-4 rounded-md border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
                    {errorText}
                </div>
            ) : null}

            <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
                <div className="text-sm text-neutral-400 space-y-1">
                    <div>
                        <span className="text-neutral-300">Created:</span> {fmtDate(meta.createdAt)}
                    </div>
                    <div>
                        <span className="text-neutral-300">Expires:</span> {fmtDate(meta.expiresAt)}
                    </div>
                    <div>
                        <span className="text-neutral-300">Views:</span> {meta.viewCount}
                        {meta.maxViews ? ` / ${meta.maxViews}` : ""}
                    </div>
                </div>

                <form action={verifySharePasswordAction} className="mt-4 space-y-3">
                    <input type="hidden" name="token" value={t} />

                    <input
                        type="password"
                        name="password"
                        placeholder="Password"
                        className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
                    />

                    <button
                        type="submit"
                        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500"
                    >
                        Unlock
                    </button>
                </form>
            </div>
        </main>
    );
}
