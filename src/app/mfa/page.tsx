import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { ensureUserByEmail } from "@/lib/authz";
import {
  consumeRecoveryCodesDisplayCookie,
  getMfaStatus,
  getOrCreatePendingMfaSecret,
  hasValidMfaCookie,
  mfaEnforcementEnabled,
  mfaTableExists,
  roleRequiresMfa,
  totpUri,
} from "@/lib/mfa";
import {
  beginMfaSetupAction,
  clearMfaSessionAction,
  enableMfaAction,
  regenerateRecoveryCodesAction,
  verifyMfaAction,
} from "./actions";
import { sanitizeInternalRedirectPath } from "@/lib/redirects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function MfaPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || "").trim().toLowerCase();
  if (!email) redirect("/signin");

  const orgId = (session?.user as { orgId?: string | null } | undefined)?.orgId ?? null;
  const orgSlug = (session?.user as { orgSlug?: string | null } | undefined)?.orgSlug ?? null;
  const user = await ensureUserByEmail(email, { orgId, orgSlug });
  if (user.role !== "admin" && user.role !== "owner") redirect("/projects/doclinks");

  if (!roleRequiresMfa(user.role) && !mfaEnforcementEnabled()) {
    redirect("/admin");
  }

  const params = await searchParams;
  const next = sanitizeInternalRedirectPath(String(params?.next || "/admin"));
  const error = String(params?.error || "").trim();
  const setupRequested = String(params?.setup || "").trim() === "1";
  const recoveryRequested = String(params?.recovery || "").trim() === "1";

  const tableReady = await mfaTableExists();
  const status = await getMfaStatus(user.id);
  const cookieValid = await hasValidMfaCookie({ userId: user.id, email: user.email, role: user.role });
  const recoveryCodes = recoveryRequested ? await consumeRecoveryCodesDisplayCookie() : null;

  let setupSecret: string | null = null;
  if (tableReady && !status.enabled && setupRequested) {
    setupSecret = status.pendingSecret || (await getOrCreatePendingMfaSecret(user.id));
  }

  const errorMessage =
    error === "invalid_code"
      ? "Code was invalid or expired. Try again."
      : error === "table_missing"
        ? "MFA table is missing. Run the migration script first."
        : error === "recovery_unavailable"
          ? "Recovery codes are unavailable. Enable MFA first."
        : null;

  return (
    <main className="mx-auto w-full max-w-[980px] p-6 text-white">
      <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
        <h1 className="text-2xl font-semibold">Multi-factor authentication</h1>
        <p className="mt-2 text-sm text-white/70">
          MFA is required for privileged access when <span className="font-mono">MFA_ENFORCE_ADMIN=1</span>.
        </p>
        {errorMessage ? (
          <p className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {errorMessage}
          </p>
        ) : null}

        {!tableReady ? (
          <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            MFA storage is not available yet. Run <span className="font-mono">scripts/sql/mfa.sql</span>.
          </div>
        ) : null}

        {tableReady && status.enabled && cookieValid ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-emerald-100">MFA verification is active for this session.</p>
            <p className="text-xs text-white/70">
              Recovery codes remaining: <span className="font-mono">{status.recoveryCodesCount}</span>
            </p>
            <form action={clearMfaSessionAction}>
              <button className="rounded-xl border border-white/20 px-3 py-2 text-sm">Clear MFA session</button>
            </form>
            <form action={regenerateRecoveryCodesAction}>
              <input type="hidden" name="next" value={next} />
              <button className="rounded-xl border border-white/20 px-3 py-2 text-sm">Regenerate recovery codes</button>
            </form>
          </div>
        ) : null}

        {recoveryCodes?.length ? (
          <div className="mt-4 space-y-3 rounded-xl border border-amber-300/35 bg-amber-500/10 p-3">
            <p className="text-sm text-amber-100">
              Save these recovery codes now. They are shown only once and each code can be used a single time.
            </p>
            <ul className="grid grid-cols-2 gap-2">
              {recoveryCodes.map((code) => (
                <li key={code} className="font-mono text-sm text-amber-50">{code}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {tableReady && status.enabled && !cookieValid ? (
          <form action={verifyMfaAction} className="mt-4 space-y-3">
            <input type="hidden" name="next" value={next} />
            <label className="block text-sm text-white/80">
              Enter authenticator code or recovery code
              <input
                name="code"
                inputMode="text"
                autoComplete="one-time-code"
                className="mt-2 w-full rounded-xl border border-white/20 bg-black/20 px-3 py-2 text-sm text-white"
              />
            </label>
            <button className="rounded-xl bg-cyan-500 px-3 py-2 text-sm font-medium text-black">Verify MFA</button>
          </form>
        ) : null}

        {tableReady && !status.enabled && !setupSecret ? (
          <form action={beginMfaSetupAction} className="mt-4">
            <input type="hidden" name="next" value={next} />
            <button className="rounded-xl bg-cyan-500 px-3 py-2 text-sm font-medium text-black">Start MFA setup</button>
          </form>
        ) : null}

        {tableReady && !status.enabled && setupSecret ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-white/80">
              Add this secret to your authenticator app, then enter the current code to enable MFA.
            </p>
            <div className="rounded-xl border border-white/15 bg-black/20 p-3">
              <div className="text-xs text-white/60">Secret</div>
              <div className="mt-1 font-mono text-sm">{setupSecret}</div>
              <div className="mt-2 text-xs text-white/60">OTP URI</div>
              <div className="mt-1 break-all font-mono text-xs text-white/80">{totpUri(setupSecret, user.email)}</div>
            </div>
            <form action={enableMfaAction} className="space-y-3">
              <input type="hidden" name="next" value={next} />
              <label className="block text-sm text-white/80">
                Enter 6-digit code
                <input
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="mt-2 w-full rounded-xl border border-white/20 bg-black/20 px-3 py-2 text-sm text-white"
                />
              </label>
              <button className="rounded-xl bg-cyan-500 px-3 py-2 text-sm font-medium text-black">Enable MFA</button>
            </form>
          </div>
        ) : null}
      </div>
    </main>
  );
}
