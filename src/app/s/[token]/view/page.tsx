import Link from "next/link";
import { redirect } from "next/navigation";
import SecurePdfCanvasViewer from "@/app/components/SecurePdfCanvasViewer";
import { resolveShareMeta } from "@/lib/resolveDoc";
import { ShareBadge, ShareShell } from "../ShareShell";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

function isMaxed(viewCount: number, maxViews: number | null) {
  if (maxViews === null || maxViews === 0) return false;
  return viewCount >= maxViews;
}

function defaultWatermarkText(token: string) {
  const base = (process.env.WATERMARK_DEFAULT_TEXT || "Confidential").trim() || "Confidential";
  const short = token.slice(0, 6);
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19) + "Z";
  return `${base}\nShare: ${short}... ${ts}`;
}

function FailState({
  token,
  title,
  body,
}: {
  token: string;
  title: string;
  body: string;
}) {
  return (
    <ShareShell token={token} title={title} subtitle={body}>
      <div className="text-sm text-white/70">
        <Link href="/" className="text-white underline decoration-white/45 underline-offset-4 hover:text-cyan-100">
          Go home
        </Link>
      </div>
    </ShareShell>
  );
}

export default async function ShareTokenViewPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;
  const t = (token || "").trim();
  if (!t) redirect("/");

  const meta = await resolveShareMeta(t);
  if (!meta.ok) return <FailState token={t} title="Not found" body="This share link does not exist." />;
  if (meta.revokedAt) return <FailState token={t} title="Link revoked" body="This share link has been revoked." />;
  if (isExpired(meta.expiresAt))
    return <FailState token={t} title="Link expired" body="This share link has expired." />;
  if (isMaxed(meta.viewCount ?? 0, meta.maxViews))
    return <FailState token={t} title="View limit reached" body="This share link has reached its max views." />;

  const moderation = (meta.docModerationStatus || "active").toLowerCase();
  if (moderation !== "active") {
    return <FailState token={t} title="Unavailable" body="This document is no longer available." />;
  }

  const risk = (meta.riskLevel || "low").toLowerCase();
  const risky = risk === "high" || (meta.scanStatus || "").toLowerCase() === "risky";
  const enabled =
    Boolean(meta.watermarkEnabled) ||
    String(process.env.WATERMARK_DEFAULT_ENABLED || "").trim() === "1" ||
    String(process.env.WATERMARK_DEFAULT_ENABLED || "").trim().toLowerCase() === "true";

  const text = (meta.watermarkText || "").trim() || defaultWatermarkText(t);
  const rawUrl = `/s/${encodeURIComponent(t)}/raw`;
  const contentTypeRows = (await sql`
    select coalesce(content_type::text, '') as content_type
    from public.docs
    where id = ${meta.docId}::uuid
    limit 1
  `) as unknown as Array<{ content_type: string }>;
  const contentType = String(contentTypeRows?.[0]?.content_type || "").trim() || "application/pdf";
  const typeLabel = contentType.includes("/")
    ? contentType.split("/")[1]?.toUpperCase() || "FILE"
    : "FILE";

  return (
    <ShareShell token={t} title="Secure Document" subtitle="View-only document delivery with policy controls.">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <ShareBadge>{typeLabel}</ShareBadge>
          <ShareBadge tone="good">Encrypted</ShareBadge>
          <ShareBadge>{meta.expiresAt ? `Expires ${new Date(meta.expiresAt).toLocaleString()}` : "No expiration"}</ShareBadge>
          {meta.maxViews !== null ? (
            <ShareBadge>{meta.maxViews === 0 ? "Unlimited views" : `Max views ${meta.maxViews}`}</ShareBadge>
          ) : null}
          <ShareBadge tone={risky ? "warn" : "good"}>Scan: {risky ? "Risky" : "Clean"}</ShareBadge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className="btn-base btn-secondary rounded-xl px-4 py-2 text-sm">
            Home
          </Link>
        </div>

        {risky ? (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-100">
            This PDF has characteristics commonly used for phishing or malware delivery. Inline view is disabled.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/15 bg-black/20">
            <SecurePdfCanvasViewer
              rawUrl={rawUrl}
              mimeType={contentType}
              watermarkEnabled={enabled}
              watermarkText={text}
              className="h-[calc(100vh-220px)]"
            />
          </div>
        )}
      </div>
    </ShareShell>
  );
}
