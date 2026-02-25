import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function AcceptableUsePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-white/60">cyang.io</div>
          <h1 className="mt-1 text-2xl font-semibold text-white">Acceptable Use Policy</h1>
          <div className="mt-2 text-sm text-white/60">
            This is a lightweight policy for cyang-doclinks. Replace with your formal AUP when you’re ready.
          </div>
        </div>
        <Link href="/" className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">
          Home
        </Link>
      </div>

      <div className="mt-8 space-y-6 text-sm text-white/75">
        <section>
          <h2 className="text-base font-semibold text-white">You may not upload or share</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Content that is illegal, or facilitates illegal activity.</li>
            <li>Child sexual abuse material (CSAM) or any exploitative sexual content involving minors.</li>
            <li>Malware, phishing documents, or instructions intended to compromise systems or accounts.</li>
            <li>Copyright-infringing content you do not have rights to distribute.</li>
            <li>Doxxing or content that violates privacy or safety of others.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Enforcement</h2>
          <p className="mt-2">
            We may disable access to a document or revoke a share link at any time, with or without notice, to protect
            users and comply with legal obligations.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Reporting</h2>
          <p className="mt-2">
            Use the <Link href="/report" className="underline text-white/90 hover:text-white">report form</Link> to flag
            a link. Provide as much context as possible.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Disclaimer</h2>
          <p className="mt-2">
            This policy is provided “as-is” and should be reviewed by counsel for production use.
          </p>
        </section>
      </div>
    </main>
  );
}
