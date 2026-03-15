import { SiteShell } from "@/app/components/SiteShell";
import StatusCenterClient, { type StatusPreview } from "./StatusCenterClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StatusPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const params = await searchParams;
  const previewRaw = String(params.preview || "").trim().toLowerCase();
  const preview: StatusPreview =
    previewRaw === "operational" ||
    previewRaw === "degraded" ||
    previewRaw === "partial_outage" ||
    previewRaw === "major_outage" ||
    previewRaw === "maintenance" ||
    previewRaw === "loading"
      ? previewRaw
      : "live";

  return (
    <SiteShell maxWidth="full">
      <div className="mx-auto w-full max-w-[1700px] px-3 py-8 sm:px-4 lg:px-6">
        <StatusCenterClient preview={preview} />
      </div>
    </SiteShell>
  );
}

