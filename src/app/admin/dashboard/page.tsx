// src/app/admin/dashboard/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { isOwnerAdmin } from "@/lib/admin";
import DeleteDocForm from "../DeleteDocForm";
import { deleteDocAction } from "../actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DocRow = {
    id: string;
    title: string | null;
    created_at: string;
    alias: string | null;
};

export default async function AdminDashboardPage() {
    const ok = await isOwnerAdmin();
    if (!ok) redirect("/api/auth/signin");

    const docs = (await sql`
    select
      d.id::text as id,
      d.title,
      d.created_at::text as created_at,
      a.alias
    from docs d
    left join doc_aliases a on a.doc_id = d.id
    order by d.created_at desc
  `) as unknown as DocRow[];

    return (
        <main className="mx-auto max-w-6xl px-4 py-12">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">
                        Admin dashboard
                    </h1>
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

            <div className="mt-8 overflow-hidden rounded-lg border border-neutral-800">
                <table className="w-full text-sm">
                    <thead className="bg-neutral-900 text-neutral-300">
                        <tr>
                            <th className="px-4 py-3 text-left">Title</th>
                            <th className="px-4 py-3 text-left">Alias</th>
                            <th className="px-4 py-3 text-left">Created</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {docs.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-4 py-6 text-neutral-400">
                                    No documents found.
                                </td>
                            </tr>
                        ) : (
                            docs.map((doc) => (
                                <tr key={doc.id} className="border-t border-neutral-800">
                                    <td className="px-4 py-3">
                                        {doc.title || "Untitled"}
                                        <div className="text-xs text-neutral-500 font-mono">
                                            {doc.id}
                                        </div>
                                    </td>

                                    <td className="px-4 py-3">
                                        {doc.alias ? (
                                            <Link
                                                href={`/d/${doc.alias}`}
                                                className="text-blue-400 hover:underline"
                                                target="_blank"
                                            >
                                                {doc.alias}
                                            </Link>
                                        ) : (
                                            <span className="text-neutral-500">—</span>
                                        )}
                                    </td>

                                    <td className="px-4 py-3 text-neutral-400">
                                        {new Date(doc.created_at).toLocaleString()}
                                    </td>

                                    <td className="px-4 py-3 text-right">
                                        <DeleteDocForm
                                            docId={doc.id}
                                            title={doc.title || "Untitled"}
                                            action={deleteDocAction}
                                        />
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </main>
    );
}
