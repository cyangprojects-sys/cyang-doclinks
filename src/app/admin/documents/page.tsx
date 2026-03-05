import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import DashboardHeaderActions from "@/app/admin/dashboard/DashboardHeaderActions";
import UnifiedDocsTableClient from "@/app/admin/dashboard/UnifiedDocsTableClient";
import { getDashboardDocumentsData } from "@/app/admin/dashboard/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminDocumentsPage() {
  let u;
  try {
    u = await requireUser();
  } catch {
    redirect("/api/auth/signin");
  }

  const data = await getDashboardDocumentsData(u);
  const headerDocs = data.unifiedRows.map((r) => ({
    docId: r.doc_id,
    title: r.doc_title || "Untitled document",
    docState: r.doc_state,
    scanState: r.scan_status,
    moderationStatus: r.moderation_status,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Documents</h1>
          <div className="mt-1 text-sm text-white/65">All documents and their sharing status.</div>
        </div>
        <DashboardHeaderActions docs={headerDocs} planId={data.planId} />
      </div>

      {data.missingCoreTables ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-300">
          <div className="font-medium text-neutral-100">Documents unavailable</div>
          <div className="mt-1 text-neutral-400">The `public.docs` table is missing.</div>
        </div>
      ) : (
        <UnifiedDocsTableClient rows={data.unifiedRows} defaultPageSize={25} showDelete={data.showDelete} />
      )}
    </div>
  );
}
