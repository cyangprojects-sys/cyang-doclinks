import Link from "next/link";
import { redirect } from "next/navigation";
import PasswordGate from "./passwordGate";
import { isShareUnlockedAction, verifySharePasswordAction } from "./actions";
import { resolveShareMeta } from "@/lib/resolveDoc";
import { ShareBadge, ShareShell } from "./ShareShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmtDate(s: string | null) {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

function isMaxed(viewCount: number, maxViews: number | null) {
  if (maxViews === null || maxViews === 0) return false;
  return viewCount >= maxViews;
}

function maskEmail(e: string) {
  const s = (e || "").trim();
  const at = s.indexOf("@");
  if (at <= 1) return "***";
  const name = s.slice(0, at);
  const domain = s.slice(at + 1);
  return `${name.slice(0, 2)}***@${domain}`;
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

export default async function ShareTokenPage(props: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await props.params;
  const sp = (await props.searchParams) || {};
  const errorParam = sp.error;
  const errorText = Array.isArray(errorParam) ? errorParam[0] : errorParam;

  const t = (token || "").trim();
  if (!t) redirect("/");

  const meta = await resolveShareMeta(t);
  if (!meta.ok) return <FailState token={t} title="Not found" body="This share link does not exist." />;
  if (meta.revokedAt) return <FailState token={t} title="Link revoked" body="This share link has been revoked." />;
  if (isExpired(meta.expiresAt))
    return <FailState token={t} title="Link expired" body="This share link has expired." />;
  if (isMaxed(meta.viewCount ?? 0, meta.maxViews))
    return <FailState token={t} title="View limit reached" body="This share link has reached its max views." />;

  const unlocked = await isShareUnlockedAction(t);
  if (unlocked) redirect(`/s/${encodeURIComponent(t)}/view`);

  const requireEmail = !!meta.toEmail;
  const expiresLabel = fmtDate(meta.expiresAt);

  return (
    <ShareShell token={t} title="Secure Share Link" subtitle="Review access requirements, then open the document.">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <ShareBadge>PDF</ShareBadge>
          <ShareBadge tone="good">Encrypted</ShareBadge>
          {expiresLabel ? <ShareBadge>Expires {expiresLabel}</ShareBadge> : <ShareBadge>No expiration</ShareBadge>}
          {meta.maxViews !== null ? (
            <ShareBadge>{meta.maxViews === 0 ? "Unlimited views" : `Max views ${meta.maxViews}`}</ShareBadge>
          ) : null}
          {requireEmail ? <ShareBadge tone="warn">Recipient restricted</ShareBadge> : null}
          {meta.hasPassword ? <ShareBadge tone="warn">Password protected</ShareBadge> : null}
        </div>

        {errorText ? (
          <div className="rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {errorText}
          </div>
        ) : null}

        {!meta.hasPassword && !requireEmail ? (
          <form action={verifySharePasswordAction} className="space-y-4">
            <input type="hidden" name="token" value={t} />
            <input type="hidden" name="password" value="" />
            <button type="submit" className="btn-base btn-primary rounded-xl px-4 py-2 text-sm font-medium">
              View document
            </button>
          </form>
        ) : (
          <PasswordGate
            token={t}
            hasPassword={meta.hasPassword}
            requireEmail={requireEmail}
            emailHint={meta.toEmail ? maskEmail(meta.toEmail) : null}
          />
        )}
      </div>
    </ShareShell>
  );
}

