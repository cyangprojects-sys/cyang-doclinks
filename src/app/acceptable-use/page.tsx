import Link from "next/link";
import { getSupportEmail } from "@/lib/legal";
import { SiteShell } from "@/app/components/SiteShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function AcceptableUsePage() {
  const supportEmail = getSupportEmail();

  return (
    <SiteShell maxWidth="full">
      <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-white/60">cyang.io</div>
          <h1 className="mt-1 text-2xl font-semibold text-white">Acceptable Use Policy</h1>
          <div className="mt-2 text-sm text-white/60">Policy for cyang-doclinks content and behavior.</div>
        </div>
        <Link href="/" className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">
          Home
        </Link>
      </div>

      <div className="mt-8 space-y-6 text-sm text-white/75">
        <section>
          <h2 className="text-base font-semibold text-white">Prohibited content and activity</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Illegal content or content facilitating illegal activity.</li>
            <li>Child sexual abuse material or exploitative content involving minors.</li>
            <li>Phishing, malware distribution, credential theft, or malicious payload delivery.</li>
            <li>Unauthorized copyrighted material.</li>
            <li>Harassment, doxxing, or content that threatens privacy or personal safety.</li>
            <li>Attempts to bypass plan limits, access controls, or rate limits.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Upload safety rules</h2>
          <p className="mt-2">Uploads are allowlist-only and validated by extension, MIME type, and file signature where applicable.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Disallowed: executables, scripts, shortcut/system binaries, and macro-enabled office files.</li>
            <li>Rejected examples include .exe, .bat, .cmd, .msi, .js, .vbs, .ps1, .py, .php, .dll, .sys, .lnk, .pif, .scr, .docm, .xlsm, and .pptm.</li>
            <li>Unsupported or mismatched file types are blocked even if renamed.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Enforcement actions</h2>
          <p className="mt-2">
            We may quarantine documents, revoke shares, disable tenant access, limit API actions,
            or suspend accounts to protect users and maintain service integrity.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Reporting and legal process</h2>
          <p className="mt-2">
            Use{" "}
            <Link href="/report" className="underline text-white/90 hover:text-white">
              /report
            </Link>{" "}
            to submit abuse reports and{" "}
            <Link href="/dmca" className="underline text-white/90 hover:text-white">
              /dmca
            </Link>{" "}
            for copyright notices. Contact: {" "}
            <a className="underline text-white/90 hover:text-white" href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>
            .
          </p>
        </section>
      </div>
      </main>
    </SiteShell>
  );
}
