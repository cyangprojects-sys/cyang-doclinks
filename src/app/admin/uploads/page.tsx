import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import DashboardHeaderActions from "@/app/admin/dashboard/DashboardHeaderActions";
import UploadPanel from "@/app/admin/dashboard/UploadPanel";
import { getDashboardDocumentsData } from "@/app/admin/dashboard/data";
import { normalizeScanState } from "@/lib/documentStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminUploadsPage({
  searchParams,
}: {
  searchParams: Promise<{ openPicker?: string; fromCreateLink?: string; show?: string }>;
}) {
  let u;
  try {
    u = await requireUser();
  } catch {
    redirect("/api/auth/signin");
  }

  const data = await getDashboardDocumentsData(u);
  const params = await searchParams;
  const autoOpenPicker = String(params?.openPicker || "") === "1";
  const fromCreateLink = String(params?.fromCreateLink || "") === "1";
  const show = String(params?.show || "").trim().toLowerCase();
  const showFailed = show === "failed";
  const headerDocs = data.unifiedRows.map((r) => ({
    docId: r.doc_id,
    title: r.doc_title || "Untitled document",
    docState: r.doc_state,
    scanState: r.scan_status,
    moderationStatus: r.moderation_status,
  }));
  const failedRows = data.unifiedRows.filter((r) => {
    const docState = String(r.doc_state || "").trim().toLowerCase();
    const scanState = normalizeScanState(r.scan_status, r.moderation_status);
    return docState === "error" || scanState === "NEEDS_REVIEW";
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Uploads</h1>
          <div className="mt-1 text-sm text-white/65">Upload documents, then share with a protected link.</div>
        </div>
        <DashboardHeaderActions docs={headerDocs} planId={data.planId} />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        {fromCreateLink ? (
          <div className="mb-3 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
            Upload a document to create your first protected link.
          </div>
        ) : null}
        {showFailed ? (
          <div className="mb-3 rounded-lg border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            Viewing upload failures.
            {failedRows.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-rose-100/90">
                {failedRows.slice(0, 8).map((r) => (
                  <li key={r.doc_id}>
                    <Link href={`/admin/docs/${encodeURIComponent(r.doc_id)}`} className="underline hover:text-white">
                      {r.doc_title || "Untitled document"}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-1 text-xs text-rose-100/85">No recent failed uploads found.</div>
            )}
          </div>
        ) : null}
        <div className="mb-3 text-sm text-white/75">Upload a document, then create a protected link in one flow.</div>
        <UploadPanel canCheckEncryptionStatus={data.canCheckEncryptionStatus} autoOpenPicker={autoOpenPicker} />
      </div>
    </div>
  );
}
