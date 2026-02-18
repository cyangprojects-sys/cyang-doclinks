// src/app/s/[token]/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  isShareUnlockedAction,
  requestEmailProofAction,
  verifySharePasswordAction,
} from "./actions";
import { resolveShareMeta } from "@/lib/resolveDoc";
import {
  makeDeviceTrustCookieValue,
  shareUnlockCookieName,
  unlockCookieOptions,
  verifyEmailProofToken,
} from "@/lib/shareAuth";
import crypto from "crypto";
import { sql } from "@/lib/db";

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

async function logAccess(opts: {
  token: string;
  emailUsed: string | null;
  success: boolean;
  failureReason: string | null;
}) {
  try {
    await sql`
      insert into public.doc_access_logs
        (share_id, ip, user_agent, email_used, success, failure_reason)
      values
        (${opts.token}, ${null}, ${null}, ${opts.emailUsed}, ${opts.success}, ${opts.failureReason})
    `;
  } catch {
    // best-effort
  }
}

async function upsertTrustedDevice(opts: {
  token: string;
  deviceHash: string;
  expiresAtIso: string;
  emailUsed: string | null;
}) {
  try {
    await sql`
      insert into public.trusted_devices (share_id, device_hash, expires_at, email_used)
      values (${opts.token}, ${opts.deviceHash}, ${opts.expiresAtIso}, ${opts.emailUsed})
    `;
  } catch {
    // ignore
  }
}

export default async function ShareTokenPage(props: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await props.params;
  const sp = (await props.searchParams) || {};
  const errorParam = sp.error;
  const sentParam = sp.sent;
  const proofParam = sp.proof;
  const errorText = Array.isArray(errorParam) ? errorParam[0] : errorParam;
  const sentText = Array.isArray(sentParam) ? sentParam[0] : sentParam;
  const proof = Array.isArray(proofParam) ? proofParam[0] : proofParam;

  const t = (token || "").trim();
  if (!t) redirect("/");

  const meta = await resolveShareMeta(t);
  if (!meta.ok) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <h1 className="text-xl font-semibold">Not found</h1>
        <p className="mt-2 text-sm text-neutral-400">This share link doesn’t exist.</p>
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

  // If user clicked an email-proof link, consume it and trust this device.
  if (proof) {
    const v = verifyEmailProofToken(proof);
    if (v.ok && v.token === t) {
      const allowed = (meta.allowedEmail || "").toLowerCase();
      const got = (v.email || "").toLowerCase();
      if (allowed && allowed === got) {
        const deviceId = crypto.randomBytes(24).toString("base64url");
        const deviceHash = crypto.createHash("sha256").update(deviceId).digest("hex");
        const expiresAt = new Date(Date.now() + 8 * 3600 * 1000);

        await upsertTrustedDevice({
          token: t,
          deviceHash,
          expiresAtIso: expiresAt.toISOString(),
          emailUsed: got,
        });

        const c = await cookies();
        c.set(
          shareUnlockCookieName(),
          makeDeviceTrustCookieValue({ token: t, deviceId }),
          unlockCookieOptions()
        );

        await logAccess({ token: t, emailUsed: got, success: true, failureReason: null });
        redirect(`/s/${encodeURIComponent(t)}/raw`);
      }
    }

    // Bad/expired proof → show message
    redirect(`/s/${encodeURIComponent(t)}?error=${encodeURIComponent("That verification link is invalid or expired.")}`);
  }

  const unlocked = await isShareUnlockedAction(t);
  if (unlocked) redirect(`/s/${encodeURIComponent(t)}/raw`);

  // Email-bound enforcement gate
  if (meta.allowedEmail) {
    async function sendEmailProof(formData: FormData) {
      "use server";
      const res = await requestEmailProofAction(formData);
      if (!res.ok) {
        redirect(`/s/${encodeURIComponent(t)}?error=${encodeURIComponent(res.message)}`);
      }
      redirect(`/s/${encodeURIComponent(t)}?sent=1`);
    }

    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <h1 className="text-xl font-semibold">Verify your email</h1>
        <p className="mt-2 text-sm text-neutral-400">
          This link is locked to a specific recipient. Enter the authorized email to receive a secure access link.
        </p>

        {errorText ? (
          <div className="mt-4 rounded-md border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
            {errorText}
          </div>
        ) : null}

        {sentText ? (
          <div className="mt-4 rounded-md border border-emerald-900/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
            Email sent. Check your inbox.
          </div>
        ) : null}

        <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
          <form action={sendEmailProof} className="space-y-3">
            <input type="hidden" name="token" value={t} />
            <input
              type="email"
              name="email"
              placeholder="you@example.com"
              className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
              required
            />
            <button
              type="submit"
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500"
            >
              Send secure access link
            </button>
          </form>
        </div>
      </main>
    );
  }

  // If no password, show Continue that triggers the action (action will redirect to /raw)
  if (!meta.hasPassword) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        {errorText ? (
          <div className="mb-4 rounded-md border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
            {errorText}
          </div>
        ) : null}

        <form action={verifySharePasswordAction}>
          <input type="hidden" name="token" value={t} />
          <input type="hidden" name="password" value="" />
          <button
            type="submit"
            className="rounded-md bg-neutral-800 px-4 py-2 text-sm text-neutral-100 hover:bg-neutral-700"
          >
            Continue
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-xl font-semibold">Protected link</h1>
      <p className="mt-2 text-sm text-neutral-400">This share requires a password.</p>

      {errorText ? (
        <div className="mt-4 rounded-md border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
          {errorText}
        </div>
      ) : null}

      <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
        <div className="text-sm text-neutral-400 space-y-1">
          <div>
            <span className="text-neutral-300">Created:</span> {fmtDate(meta.createdAt)}
          </div>
          <div>
            <span className="text-neutral-300">Expires:</span> {fmtDate(meta.expiresAt)}
          </div>
          <div>
            <span className="text-neutral-300">Views:</span> {meta.viewCount}
            {meta.maxViews ? ` / ${meta.maxViews}` : ""}
          </div>
        </div>

        <form action={verifySharePasswordAction} className="mt-4 space-y-3">
          <input type="hidden" name="token" value={t} />

          <input
            type="password"
            name="password"
            placeholder="Password"
            className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
          />

          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500"
          >
            Unlock
          </button>
        </form>
      </div>
    </main>
  );
}
