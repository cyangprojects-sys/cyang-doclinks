import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-white/60">cyang.io</div>
          <h1 className="mt-1 text-2xl font-semibold text-white">Terms</h1>
          <div className="mt-2 text-sm text-white/60">
            Placeholder terms for cyang-doclinks. Replace with your formal Terms of Service.
          </div>
        </div>
        <Link href="/" className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">
          Home
        </Link>
      </div>

      <div className="mt-8 space-y-4 text-sm text-white/75">
        <p>
          cyang-doclinks is provided on an “as available” basis, without warranties of any kind. You are responsible for
          the content you upload and share.
        </p>
        <p>
          We may suspend or terminate access to content or accounts to protect users, comply with law, or prevent abuse.
        </p>
        <p>
          If you are reporting abuse, use <Link href="/report" className="underline text-white/90 hover:text-white">/report</Link>.
        </p>
      </div>
    </main>
  );
}
