// src/app/admin/page.tsx
import Link from "next/link";
import { isOwnerAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const ok = await isOwnerAdmin();

  if (!ok) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
          <Link
            href="/"
            className="text-sm text-neutral-400 hover:text-neutral-200 underline underline-offset-4"
          >
            Home
          </Link>
        </div>

        <p className="mt-3 text-sm text-neutral-300">Owner access required.</p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/api/auth/signin"
            className="inline-block rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-semibold text-neutral-100 hover:bg-neutral-800"
          >
            Sign in
          </Link>

          <Link
            href="/"
            className="inline-block rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-sm font-semibold text-neutral-200 hover:bg-neutral-900"
          >
            Back home
          </Link>
        </div>

        <div className="mt-4 text-xs text-neutral-500">
          Make sure <span className="font-mono">OWNER_EMAIL</span> is set in env.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
          <p className="mt-1 text-sm text-neutral-400">You’re signed in as the owner.</p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-sm text-neutral-400 hover:text-neutral-200 underline underline-offset-4"
          >
            Home
          </Link>

          <Link
            href="/api/auth/signout"
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-semibold text-neutral-100 hover:bg-neutral-800"
          >
            Sign out
          </Link>
        </div>
      </div>

      <div className="mt-8 rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/admin/dashboard"
            className="inline-block rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-semibold text-neutral-100 hover:bg-neutral-800"
          >
            Open dashboard
          </Link>

          <Link
            href="/api/auth/signin"
            className="text-sm text-neutral-400 hover:text-neutral-200 underline underline-offset-4"
          >
            Switch account
          </Link>
        </div>

        <div className="mt-3 text-sm text-neutral-300">
          Manage documents, shares, and cleanup from the dashboard.
        </div>
      </div>
    </main>
  );
}
