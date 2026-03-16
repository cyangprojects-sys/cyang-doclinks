import Link from "next/link";
import type { Metadata } from "next";
import { SiteShell } from "@/app/components/SiteShell";
import LegalCenterClient from "@/app/legal/LegalCenterClient";
import { LEGAL_DOCS } from "@/lib/legalDocs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Legal and Trust Center - cyang.io",
  description:
    "Customer-facing legal, privacy, security, and reliability documentation for cyang.io and Doclinks.",
};

export default function LegalIndexPage() {
  return (
    <SiteShell maxWidth="full">
      <section className="relative mt-10">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-16 top-0 h-72 w-72 rounded-full bg-sky-400/12 blur-3xl" />
          <div className="absolute right-0 top-8 h-80 w-80 rounded-full bg-teal-300/10 blur-3xl" />
        </div>

        <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]">
              Legal and Trust Center
            </span>
            <h1 className="font-editorial mt-5 max-w-4xl text-4xl leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Policies built for
              <span className="block text-white/72">clarity, trust, and serious operations.</span>
            </h1>
            <p className="mt-7 max-w-3xl text-base leading-relaxed text-white/72 sm:text-lg">
              Review legal terms, privacy commitments, data-processing documentation, security posture, reliability commitments,
              and vendor transparency in one unified legal and trust experience.
            </p>

            <div className="mt-7 flex flex-wrap gap-2">
              <span className="ui-badge rounded-full px-3 py-1.5 text-xs">Clear policies</span>
              <span className="ui-badge rounded-full px-3 py-1.5 text-xs">Security-minded operations</span>
              <span className="ui-badge rounded-full px-3 py-1.5 text-xs">Transparent data practices</span>
              <span className="ui-badge rounded-full px-3 py-1.5 text-xs">Business-ready documentation</span>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="glass-card-strong rounded-3xl p-6">
              <div className="text-xs uppercase tracking-[0.14em] text-white/55">Start here</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/12 bg-black/25 p-4">
                  <div className="text-sm font-medium text-white/90">New to cyang.io?</div>
                  <p className="mt-1 text-xs leading-relaxed text-white/64">Start with Terms, Privacy, and Security.</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <Link href="/legal/terms-of-service" className="text-white/80 underline hover:text-white">Terms</Link>
                    <Link href="/legal/privacy-policy" className="text-white/80 underline hover:text-white">Privacy</Link>
                    <Link href="/legal/security-policy" className="text-white/80 underline hover:text-white">Security</Link>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/12 bg-black/25 p-4">
                  <div className="text-sm font-medium text-white/90">Evaluating for business?</div>
                  <p className="mt-1 text-xs leading-relaxed text-white/64">Review DPA, SLA, Security, and Subprocessors.</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <Link href="/legal/data-processing-addendum" className="text-white/80 underline hover:text-white">DPA</Link>
                    <Link href="/legal/service-level-agreement" className="text-white/80 underline hover:text-white">SLA</Link>
                    <Link href="/legal/subprocessors" className="text-white/80 underline hover:text-white">Subprocessors</Link>
                    <Link href="/trust/procurement" className="text-white/80 underline hover:text-white">Procurement pack</Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-12">
        <div className="glass-card rounded-3xl p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-tight text-white">Trust highlights</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <TrustStrip text="We do not sell customer data." />
            <TrustStrip text="Uploaded documents are encrypted and policy-gated." />
            <TrustStrip text="Security issues can be reported directly." />
            <TrustStrip text="Paid plans include service-level commitments." />
            <TrustStrip text="Subprocessors are disclosed transparently." />
          </div>
        </div>
      </section>

      <section className="mt-12">
        <LegalCenterClient docs={LEGAL_DOCS} />
      </section>
    </SiteShell>
  );
}

function TrustStrip({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-black/25 p-4 text-sm leading-relaxed text-white/72">
      {text}
    </div>
  );
}
