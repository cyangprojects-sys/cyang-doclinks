import Link from "next/link";
import { getDmcaEmail, getSupportEmail } from "@/lib/legal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function DmcaPage() {
  const dmcaEmail = getDmcaEmail();
  const supportEmail = getSupportEmail();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-white/60">cyang.io</div>
          <h1 className="mt-1 text-2xl font-semibold text-white">DMCA Policy</h1>
          <div className="mt-2 text-sm text-white/60">
            Copyright notice and takedown procedure.
          </div>
        </div>
        <Link href="/" className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">
          Home
        </Link>
      </div>

      <div className="mt-8 space-y-6 text-sm text-white/75">
        <section>
          <h2 className="text-base font-semibold text-white">How to submit a notice</h2>
          <p className="mt-2">
            Send notices to{" "}
            <a className="underline text-white/90 hover:text-white" href={`mailto:${dmcaEmail}`}>
              {dmcaEmail}
            </a>{" "}
            or use{" "}
            <Link href="/report" className="underline text-white/90 hover:text-white">
              /report
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Required notice details</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Your full legal name and contact information.</li>
            <li>Identification of the copyrighted work claimed to be infringed.</li>
            <li>URL/token/alias of the allegedly infringing material.</li>
            <li>Good-faith statement of unauthorized use.</li>
            <li>Statement under penalty of perjury that information is accurate and you are authorized.</li>
            <li>Your physical or electronic signature.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">What happens next</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Notices are reviewed and logged in our administrative DMCA workflow.</li>
            <li>We may disable access to content while investigation is in progress.</li>
            <li>Where appropriate, we may restore content after receiving a valid counter-notice.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Counter-notice</h2>
          <p className="mt-2">
            If your content was removed in error, send a counter-notice to{" "}
            <a className="underline text-white/90 hover:text-white" href={`mailto:${dmcaEmail}`}>
              {dmcaEmail}
            </a>
            . Include your contact details, removed content reference, good-faith statement, and signature.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">General contact</h2>
          <p className="mt-2">
            For non-DMCA legal inquiries, contact{" "}
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

