import Link from "next/link";
import ReportForm from "./ReportForm";
import { SiteShell } from "@/app/components/SiteShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ReportPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await props.searchParams) || {};
  const tokenRaw = sp.token;
  const aliasRaw = sp.alias;

  const token = Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw;
  const alias = Array.isArray(aliasRaw) ? aliasRaw[0] : aliasRaw;

  return (
    <SiteShell maxWidth="full">
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-white/60">cyang.io</div>
          <h1 className="mt-1 text-xl font-semibold text-white">Report abuse</h1>
          <div className="mt-1 text-sm text-white/60">
            Report malware, phishing, illegal content, policy abuse, or suspicious share behavior.
          </div>
        </div>
        <Link href="/" className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">
          Home
        </Link>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/70">
        Include token or alias details when available. Reports feed directly into abuse moderation,
        quarantine actions, and immutable security events.
      </div>

      <div className="mt-6">
        <ReportForm token={token || null} alias={alias || null} />
      </div>

      <div className="mt-6 text-xs text-white/50">
        Abuse reports are reviewed by the owner/admin team. Intentional false reports may result in
        access restrictions.
      </div>
      </main>
    </SiteShell>
  );
}
