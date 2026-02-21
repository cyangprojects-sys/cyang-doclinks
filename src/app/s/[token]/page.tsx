// src/app/s/[token]/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import PasswordGate from "./passwordGate";
import { isShareUnlockedAction, verifySharePasswordAction } from "./actions";
import { resolveShareMeta } from "@/lib/resolveDoc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

function isExpired(expires_at: string | null) {
  if (!expires_at) return false;
  return new Date(expires_at).getTime() <= Date.now();
}

function isMaxed(view_count: number, max_views: number | null) {
  if (max_views === null) return false;
  if (max_views === 0) return false;
  return view_count >= max_views;
}

function maskEmail(e: string) {
  const s = (e || "").trim();
  const at = s.indexOf("@");
  if (at <= 1) return "•••";
  const name = s.slice(0, at);
  const domain = s.slice(at + 1);
  const head = name.slice(0, 2);
  return `${head}•••@${domain}`;
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
  if (!meta.ok) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <h1 className="text-xl font-semibold">Not found</h1>
        <p className="mt-2 text-sm text-neutral-400">
          This share link doesn’t exist.
        </p>
        <div className="mt-6">
          <Link href="/" className="text-blue-400 hover:underline">
            Go home
          </Link>
        </div>
      </main>
    );
  }

  if (meta.revokedAt) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <h1 className="text-xl font-semibold">Link revoked</h1>
        <p className="mt-2 text-sm text-neutral-400">
          This share link has been revoked.
        </p>
      </main>
    );
  }

  if (isExpired(meta.expiresAt)) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <h1 className="text-xl font-semibold">Link expired</h1>
        <p className="mt-2 text-sm text-neutral-400">
          This share link has expired.
        </p>
      </main>
    );
  }

  if (isMaxed(meta.viewCount ?? 0, meta.maxViews)) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <h1 className="text-xl font-semibold">View limit reached</h1>
        <p className="mt-2 text-sm text-neutral-400">
          This share link has reached its max views.
        </p>
      </main>
    );
  }

  const unlocked = await isShareUnlockedAction(t);
  if (unlocked) redirect(`/s/${encodeURIComponent(t)}/view`);

  const requireEmail = !!meta.toEmail;

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-xl font-semibold">Cyang Docs</h1>

      <div className="mt-2 text-sm text-neutral-400">
        {meta.expiresAt ? (
          <div>Expires: {fmtDate(meta.expiresAt)}</div>
        ) : null}
        {meta.maxViews !== null ? (
          <div>
            Max views: {meta.maxViews === 0 ? "Unlimited" : meta.maxViews}
          </div>
        ) : null}
        {requireEmail ? <div>Recipient restricted</div> : null}
      </div>

      {errorText ? (
        <div className="mt-4 rounded-md border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
          {errorText}
        </div>
      ) : null}

      {!meta.hasPassword && !requireEmail ? (
        <form className="mt-6" action={verifySharePasswordAction}>
          <input type="hidden" name="token" value={t} />
          <input type="hidden" name="password" value="" />
          <button
            type="submit"
            className="rounded-md bg-neutral-800 px-4 py-2 text-sm text-neutral-100 hover:bg-neutral-700"
          >
            Continue
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
    </main>
  );
}
