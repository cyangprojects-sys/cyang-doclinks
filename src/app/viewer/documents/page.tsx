import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import DashboardHeaderActions from "@/app/admin/dashboard/DashboardHeaderActions";
import DocumentsWorkspaceClient from "@/app/admin/dashboard/DocumentsWorkspaceClient";
import { getDashboardDocumentsData } from "@/app/admin/dashboard/data";
import { resolveConfiguredPublicAppBaseUrl } from "@/lib/publicBaseUrl";

export const runtime = "nodejs";

export default async function ViewerDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ openPicker?: string; fromCreateLink?: string }>;
}) {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/signin");
  }

  if (user.role === "admin" || user.role === "owner") {
    redirect("/admin/documents");
  }

  const data = await getDashboardDocumentsData(user);
  const params = await searchParams;
  const autoOpenPicker = String(params?.openPicker || "") === "1";
  const fromCreateLink = String(params?.fromCreateLink || "") === "1";
  const headerDocs = data.unifiedRows.map((r) => ({
    docId: r.doc_id,
    title: r.doc_title || "Untitled file",
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
        uploadPickerHref="/viewer/documents?openPicker=1"
        createLinkFallbackHref="/viewer/documents?openPicker=1&fromCreateLink=1"
        upgradeHref="/pricing"
      />

      <section className="surface-panel-strong overflow-hidden p-6 sm:p-7">
        <div className="grid gap-6 xl:grid-cols-[1.3fr_minmax(0,0.9fr)]">
          <div className="space-y-5">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--accent-primary)]">Secure file sharing</div>
              <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Upload a file, create its protected link, and share it with confidence.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
                DocLinks keeps the flow obvious for everyday customers: upload first, wait for the security scan, then copy a protected link when the file is ready.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="selection-tile p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Step 1</div>
                <div className="mt-2 text-base font-semibold text-slate-950">Upload file</div>
                <div className="mt-1 text-sm text-[var(--text-secondary)]">Add a file from your device.</div>
              </div>
              <div className="selection-tile p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Step 2</div>
                <div className="mt-2 text-base font-semibold text-slate-950">Create protected link</div>
                <div className="mt-1 text-sm text-[var(--text-secondary)]">Available as soon as the scan is complete.</div>
              </div>
              <div className="selection-tile p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Step 3</div>
                <div className="mt-2 text-base font-semibold text-slate-950">Share securely</div>
                <div className="mt-1 text-sm text-[var(--text-secondary)]">Copy the link or manage it from one place.</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/viewer/documents?openPicker=1"
                className="btn-base btn-primary rounded-sm px-5 py-3 text-sm font-semibold"
              >
                Upload file
              </Link>
              <Link href="/viewer/links" className="btn-base btn-secondary rounded-sm px-4 py-3 text-sm">
                Manage active links
              </Link>
            </div>
          </div>

          <div className="surface-panel-soft p-5">
            <div className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">Customer clarity</div>
            <h2 className="mt-3 text-xl font-semibold text-slate-950">Security-first, without guesswork</h2>
            <div className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
              <div className="rounded-sm border border-[rgba(47,111,70,0.18)] bg-[rgba(47,111,70,0.06)] p-4">
                <div className="font-medium text-slate-950">Ready</div>
                <div className="mt-1">Scan complete. Safe to create a protected link.</div>
              </div>
              <div className="rounded-sm border border-[rgba(161,109,27,0.18)] bg-[rgba(161,109,27,0.06)] p-4">
                <div className="font-medium text-slate-950">Waiting for scan</div>
                <div className="mt-1">Sharing stays unavailable until the security check finishes.</div>
              </div>
              <div className="rounded-sm border border-[rgba(186,71,50,0.18)] bg-[rgba(186,71,50,0.06)] p-4">
                <div className="font-medium text-slate-950">Blocked</div>
                <div className="mt-1">Quarantined or flagged files remain blocked to prevent accidental sharing.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {data.missingCoreTables ? (
        <div className="surface-panel p-4 text-sm text-[var(--text-secondary)]">
          <div className="font-medium text-slate-950">Files unavailable</div>
          <div className="mt-1 text-[var(--text-secondary)]">Document storage is not available for this workspace yet.</div>
        </div>
      ) : (
        <DocumentsWorkspaceClient
          initialRows={data.unifiedRows}
          defaultPageSize={25}
          showDelete={data.showDelete}
          shareBaseUrl={shareBaseUrl}
          canCheckEncryptionStatus={data.canCheckEncryptionStatus}
          autoOpenPicker={autoOpenPicker}
          fromCreateLink={fromCreateLink}
          basePath="/viewer"
        />
      )}
    </div>
  );
}
