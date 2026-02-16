// src/app/admin/dashboard/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { isOwnerAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
    const ok = await isOwnerAdmin();
    if (!ok) redirect("/admin/login");

    return (
        <main className="mx-auto max-w-5xl px-4 py-12">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">Admin dashboard</h1>
                    <p className="mt-1 text-sm text-neutral-400">
                        Owner-only tools.
                    </p>
                </div>

                <Link
                    href="/admin"
                    className="text-sm text-neutral-400 hover:text-neutral-200 underline underline-offset-4"
                >
                    Back to Admin
                </Link>
            </div>

            <div className="mt-8 rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-sm text-neutral-300">
                    Drop your restored admin UI here (doc list, delete controls, alias assign, etc).
                </div>
            </div>
        </main>
    );
}
