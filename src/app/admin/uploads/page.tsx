import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import DashboardHeaderActions from "@/app/admin/dashboard/DashboardHeaderActions";
import UploadPanel from "@/app/admin/dashboard/UploadPanel";
import { getDashboardDocumentsData } from "@/app/admin/dashboard/data";
import { normalizeScanState } from "@/lib/documentStatus";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminUploadsPage({
  searchParams,
}: {
  searchParams: Promise<{ openPicker?: string; fromCreateLink?: string; show?: string; count?: string }>;
}) {
  let u;
  try {
    u = await requireUser();
  } catch {
    redirect("/api/auth/signin");
  }

  const role = String(u.role || "").trim().toLowerCase();
  if (!["owner", "admin"].includes(role)) {
    const params = await searchParams;
    const next = new URLSearchParams();
    if (String(params?.openPicker || "") === "1") next.set("openPicker", "1");
    if (String(params?.fromCreateLink || "") === "1") next.set("fromCreateLink", "1");
    const qs = next.toString();
    redirect(`/admin/dashboard${qs ? `?${qs}` : ""}`);
  }

  const data = await getDashboardDocumentsData(u);
  const params = await searchParams;
  const autoOpenPicker = String(params?.openPicker || "") === "1";
  const fromCreateLink = String(params?.fromCreateLink || "") === "1";
  const show = String(params?.show || "").trim().toLowerCase();
  const showFailed = show === "failed";
  const reportedFailureCountRaw = Number(params?.count || "0");
  const reportedFailureCount = Number.isFinite(reportedFailureCountRaw) && reportedFailureCountRaw > 0 ? Math.floor(reportedFailureCountRaw) : 0;
  const canSeeAllFailures = ["owner", "admin"].includes(String(u.role || "").trim().toLowerCase());
  const headerDocs = data.unifiedRows.map((r) => ({
    docId: r.doc_id,
    title: r.doc_title || "Untitled file",
    docState: r.doc_state,
    scanState: r.scan_status,
    moderationStatus: r.moderation_status,
  }));
  const failedRows = data.unifiedRows.filter((r) => {
    const docState = String(r.doc_state || "").trim().toLowerCase();
    const scanState = normalizeScanState(r.scan_status, r.moderation_status);
    return docState === "error" || scanState === "NEEDS_REVIEW";
  });
  let failedStartEvents: Array<{ created_at: string | null; message: string | null }> = [];
  if (showFailed) {
    try {
      failedStartEvents = (await sql`
        select
          se.created_at::text as created_at,
          nullif(trim(coalesce(se.message::text, se.meta->>'reason', se.meta->>'error', '')), '') as message
        from public.security_events se
        where se.type = 'upload_presign_error'
          and se.created_at > now() - interval '24 hours'
          ${canSeeAllFailures ? sql`` : sql`and se.actor_user_id = ${u.id}::uuid`}
        order by se.created_at desc
        limit 10
      `) as unknown as Array<{ created_at: string | null; message: string | null }>;
    } catch {
      failedStartEvents = [];
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Uploads</h1>
          <div className="mt-1 text-sm text-white/65">Upload files, then move them into protected sharing.</div>
        </div>
        <DashboardHeaderActions docs={headerDocs} planId={data.planId} />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        {fromCreateLink ? (
          <div className="mb-3 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
            Upload a file to create your first protected link.
          </div>
        ) : null}
        {showFailed ? (
          <div className="mb-3 rounded-lg border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            Viewing upload failures.
            {failedRows.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-rose-100/90">
                {failedRows.slice(0, 8).map((r) => (
                  <li key={r.doc_id}>
                    <Link href={`/admin/documents/${encodeURIComponent(r.doc_id)}`} className="underline hover:text-white">
                      {r.doc_title || "Untitled file"}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : failedStartEvents.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-rose-100/90">
                {failedStartEvents.map((e, idx) => (
                  <li key={`${e.created_at || "unknown"}-${idx}`}>
                    {e.created_at ? `${new Date(e.created_at).toLocaleString()}: ` : ""}
                    {e.message || "Upload failed to initialize before a document record was created."}
                  </li>
                ))}
              </ul>
            ) : reportedFailureCount > 0 ? (
              <div className="mt-1 text-xs text-rose-100/85">
                Detected {reportedFailureCount} failed upload start event{reportedFailureCount === 1 ? "" : "s"} in the last 24h.
                These can fail before a document record is created.
              </div>
            ) : (
              <div className="mt-1 text-xs text-rose-100/85">No recent failed uploads found.</div>
            )}
          </div>
        ) : null}
        <div className="mb-3 text-sm text-white/75">Upload a file, then create a protected link in one flow.</div>
        <UploadPanel canCheckEncryptionStatus={data.canCheckEncryptionStatus} autoOpenPicker={autoOpenPicker} />
      </div>
    </div>
  );
}
