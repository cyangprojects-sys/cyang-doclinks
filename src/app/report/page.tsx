import Link from "next/link";
import ReportForm from "./ReportForm";

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
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-white/60">cyang.io</div>
          <h1 className="mt-1 text-xl font-semibold text-white">Report abuse</h1>
          <div className="mt-1 text-sm text-white/60">
            If this link is being used to share illegal content, phishing, or malware, report it here.
          </div>
        </div>
        <Link href="/" className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">
          Home
        </Link>
      </div>

      <div className="mt-6">
        <ReportForm token={token || null} alias={alias || null} />
      </div>

      <div className="mt-6 text-xs text-white/40">
        Abuse reports are reviewed by the site owner. False reports may result in access restrictions.
      </div>
    </main>
  );
}
