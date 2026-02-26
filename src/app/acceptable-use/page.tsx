import Link from "next/link";
import { getSupportEmail } from "@/lib/legal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function AcceptableUsePage() {
  const supportEmail = getSupportEmail();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-white/60">cyang.io</div>
          <h1 className="mt-1 text-2xl font-semibold text-white">Acceptable Use Policy</h1>
          <div className="mt-2 text-sm text-white/60">Policy for use of cyang-doclinks services.</div>
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
            <li>Child sexual abuse material (CSAM) or exploitative content involving minors.</li>
            <li>Malware, phishing documents, or content intended to compromise systems/accounts.</li>
            <li>Copyright-infringing content you do not have rights to distribute.</li>
            <li>Doxxing or content that violates privacy or safety of others.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Enforcement</h2>
          <p className="mt-2">
            We may disable access to a document, revoke a share link, or suspend accounts to protect users and comply with
            legal obligations.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Reporting and legal process</h2>
          <p className="mt-2">
            Use{" "}
            <Link href="/report" className="underline text-white/90 hover:text-white">
              /report
            </Link>{" "}
            for abuse reporting and{" "}
            <Link href="/dmca" className="underline text-white/90 hover:text-white">
              /dmca
            </Link>{" "}
            for copyright notices. General contact:{" "}
            <a className="underline text-white/90 hover:text-white" href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}

