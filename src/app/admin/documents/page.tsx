import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import DashboardHeaderActions from "@/app/admin/dashboard/DashboardHeaderActions";
import UploadPanel from "@/app/admin/dashboard/UploadPanel";
import UnifiedDocsTableClient from "@/app/admin/dashboard/UnifiedDocsTableClient";
import { getDashboardDocumentsData } from "@/app/admin/dashboard/data";
import { resolveConfiguredPublicAppBaseUrl } from "@/lib/publicBaseUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ openPicker?: string; fromCreateLink?: string }>;
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
  const headerDocs = data.unifiedRows.map((r) => ({
    docId: r.doc_id,
    title: r.doc_title || "Untitled document",
    docState: r.doc_state,
    scanState: r.scan_status,
    moderationStatus: r.moderation_status,
  }));
  let shareBaseUrl: string | undefined;
  try {
    shareBaseUrl = resolveConfiguredPublicAppBaseUrl();
  } catch {
    shareBaseUrl = undefined;
  }

  return (
    <div className="space-y-6">
      <DashboardHeaderActions
        docs={headerDocs}
        planId={data.planId}
        mode="modal-only"
        uploadPickerHref="/admin/documents?openPicker=1"
        createLinkFallbackHref="/admin/documents?openPicker=1&fromCreateLink=1"
      />

      <section className="glass-card-strong ui-sheen overflow-hidden rounded-[32px] p-6 sm:p-7">
        <div className="grid gap-6 xl:grid-cols-[1.3fr_minmax(0,0.9fr)]">
          <div className="space-y-5">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-200/70">Secure document sharing</div>
              <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Upload a document, create its protected link, and share it with confidence.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/68 sm:text-base">
                DocLinks keeps the flow obvious for everyday customers: upload first, wait for the security scan, then copy a protected link when the file is ready.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-white/45">Step 1</div>
                <div className="mt-2 text-base font-semibold text-white">Upload document</div>
                <div className="mt-1 text-sm text-white/60">Add a file from your device.</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-white/45">Step 2</div>
                <div className="mt-2 text-base font-semibold text-white">Create protected link</div>
                <div className="mt-1 text-sm text-white/60">Available as soon as the scan is complete.</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-white/45">Step 3</div>
                <div className="mt-2 text-base font-semibold text-white">Share securely</div>
                <div className="mt-1 text-sm text-white/60">Copy the link or manage it from one place.</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/admin/documents?openPicker=1"
                className="btn-base rounded-2xl border border-cyan-300/45 bg-cyan-300 px-5 py-3 text-sm font-semibold text-[#07131f] shadow-[0_14px_32px_rgba(34,211,238,0.18)] hover:bg-cyan-200"
              >
                Upload document
              </Link>
              <Link href="/admin/links" className="btn-base btn-secondary rounded-2xl px-4 py-3 text-sm">
                Manage active links
              </Link>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Customer clarity</div>
            <h2 className="mt-3 text-xl font-semibold text-white">Security-first, without guesswork</h2>
            <div className="mt-4 space-y-3 text-sm text-white/68">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.07] p-4">
                <div className="font-medium text-white">Ready</div>
                <div className="mt-1">Scan complete. Safe to create a protected link.</div>
              </div>
              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] p-4">
                <div className="font-medium text-white">Waiting for scan</div>
                <div className="mt-1">Sharing stays unavailable until the security check finishes.</div>
              </div>
              <div className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] p-4">
                <div className="font-medium text-white">Blocked</div>
                <div className="mt-1">Quarantined or flagged files remain blocked to prevent accidental sharing.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {data.missingCoreTables ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-300">
          <div className="font-medium text-neutral-100">Documents unavailable</div>
          <div className="mt-1 text-neutral-400">The `public.docs` table is missing.</div>
        </div>
      ) : (
        <>
          <section className="rounded-[30px] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">Step 1</div>
                <h2 className="mt-2 text-xl font-semibold text-white">Upload document</h2>
                <p className="mt-2 max-w-2xl text-sm text-white/65">
                  Start here. When a file is clean, the document list below will guide you to create its protected link.
                </p>
              </div>
              {fromCreateLink ? (
                <div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
                  Upload a file first, then create its protected link from the document list.
                </div>
              ) : null}
            </div>
            <UploadPanel canCheckEncryptionStatus={data.canCheckEncryptionStatus} autoOpenPicker={autoOpenPicker} />
          </section>

          <UnifiedDocsTableClient
            rows={data.unifiedRows}
            defaultPageSize={25}
            showDelete={data.showDelete}
            layout="full"
            shareBaseUrl={shareBaseUrl}
          />
        </>
      )}
    </div>
  );
}
