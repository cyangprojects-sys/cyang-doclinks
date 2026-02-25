import Link from "next/link";
import { redirect } from "next/navigation";
import WatermarkedViewer from "./WatermarkedViewer";
import { resolveShareMeta } from "@/lib/resolveDoc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isExpired(expires_at: string | null) {
  if (!expires_at) return false;
  return new Date(expires_at).getTime() <= Date.now();
}

function isMaxed(view_count: number, max_views: number | null) {
  if (max_views === null) return false;
  if (max_views === 0) return false;
  return view_count >= max_views;
}

function defaultWatermarkText(token: string) {
  const base = (process.env.WATERMARK_DEFAULT_TEXT || "Confidential").trim() || "Confidential";
  const short = token.slice(0, 6);
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19) + "Z";
  return `${base}\nShare: ${short}…  ${ts}`;
}

export default async function ShareTokenViewPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;
  const t = (token || "").trim();
  if (!t) redirect("/");

  const meta = await resolveShareMeta(t);
  if (!meta.ok) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <h1 className="text-xl font-semibold">Not found</h1>
        <p className="mt-2 text-sm text-neutral-400">This share link doesn’t exist.</p>
        <div className="mt-6">
          <Link href="/" className="text-blue-400 hover:underline">Go home</Link>
        </div>
      </main>
    );
  }

  if (meta.revokedAt) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <h1 className="text-xl font-semibold">Link revoked</h1>
        <p className="mt-2 text-sm text-neutral-400">This share link has been revoked.</p>
      </main>
    );
  }

  if (isExpired(meta.expiresAt)) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <h1 className="text-xl font-semibold">Link expired</h1>
        <p className="mt-2 text-sm text-neutral-400">This share link has expired.</p>
      </main>
    );
  }

  if (isMaxed(meta.viewCount ?? 0, meta.maxViews)) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <h1 className="text-xl font-semibold">View limit reached</h1>
        <p className="mt-2 text-sm text-neutral-400">This share link has reached its max views.</p>
      </main>
    );
  }


  const moderation = (meta.docModerationStatus || "active").toLowerCase();
  if (moderation !== "active") {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <h1 className="text-xl font-semibold">Unavailable</h1>
        <p className="mt-2 text-sm text-neutral-400">
          This document is no longer available.
        </p>
        <div className="mt-6">
          <Link href="/" className="text-blue-400 hover:underline">Go home</Link>
        </div>
      </main>
    );
  }

  const risk = (meta.riskLevel || "low").toLowerCase();
  const risky = risk === "high" || (meta.scanStatus || "").toLowerCase() === "risky";
  const enabled =
    Boolean(meta.watermarkEnabled) ||
    String(process.env.WATERMARK_DEFAULT_ENABLED || "").trim() === "1" ||
    String(process.env.WATERMARK_DEFAULT_ENABLED || "").trim().toLowerCase() === "true";

  const text = (meta.watermarkText || "").trim() || defaultWatermarkText(t);
  const rawUrl = `/s/${encodeURIComponent(t)}/raw`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-white/60">cyang.io</div>
          <h1 className="mt-1 text-lg font-semibold text-white">Secure Document</h1>
          <div className="mt-1 text-xs text-white/60">
            {meta.expiresAt ? <span>Expires: {new Date(meta.expiresAt).toLocaleString()}</span> : <span>No expiration</span>}
            {meta.maxViews !== null ? (
              <span className="ml-3">Max views: {meta.maxViews === 0 ? "Unlimited" : meta.maxViews}</span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/s/${encodeURIComponent(t)}/download`}
            className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90"
          >
            Download
          </Link>
          <Link
            href={`/report?token=${encodeURIComponent(t)}`}
            className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
          >
            Report
          </Link>
          <Link href="/" className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">
            Home
          </Link>
        </div>
      </div>

      {risky ? (
        <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
          <div className="text-sm font-medium text-white">Safety warning</div>
          <div className="mt-1 text-sm text-white/70">
            This PDF has characteristics commonly used for phishing or malware delivery (risk: {risk}).
            For your safety, inline viewing is disabled — please download only if you trust the sender.
          </div>
          <div className="mt-3">
            <Link
              href={`/s/${encodeURIComponent(t)}/download`}
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90"
            >
              Download
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <WatermarkedViewer rawUrl={rawUrl} enabled={enabled} text={text} />
        </div>
      )}

      <div className="mt-3 text-xs text-white/50">
        Tip: If you see “Unauthorized”, the owner likely enabled a password or recipient email lock.
      </div>
    </main>
  );
}
