import type { Metadata } from "next";
import Link from "next/link";
import ReportForm from "./ReportForm";
import { SiteShell } from "@/app/components/SiteShell";

export const runtime = "nodejs";
export const dynamic = "force-static";
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Report Abuse - cyang.io",
  description:
    "Report malware, phishing, illegal content, policy abuse, or suspicious sharing behavior. Reports are reviewed through moderation, quarantine, and security logging workflows.",
};

export default function ReportPage() {
  return (
    <SiteShell maxWidth="full">
      <section className="relative mt-10 grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-16 top-0 h-72 w-72 rounded-full bg-sky-400/12 blur-3xl" />
          <div className="absolute right-0 top-8 h-80 w-80 rounded-full bg-teal-300/12 blur-3xl" />
        </div>

        <div className="lg:col-span-7">
          <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]">Trust and safety</span>
          <h1 className="font-editorial mt-5 max-w-4xl text-4xl leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Report abuse
            <span className="block text-white/72">quickly, clearly, and securely.</span>
          </h1>
          <p className="mt-7 max-w-3xl text-base leading-relaxed text-white/72 sm:text-lg">
            Use this page to report malware, phishing, illegal content, policy abuse, or suspicious share behavior.
            Reports are reviewed seriously and routed into moderation and quarantine workflows.
          </p>

          <div className="mt-7 flex flex-wrap gap-2">
            <span className="ui-badge rounded-full px-3 py-1.5 text-xs">Reviewed by admins</span>
            <span className="ui-badge rounded-full px-3 py-1.5 text-xs">Quarantine-aware</span>
            <span className="ui-badge rounded-full px-3 py-1.5 text-xs">Security logged</span>
            <span className="ui-badge rounded-full px-3 py-1.5 text-xs">Customer safety first</span>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="glass-card-strong rounded-3xl p-6">
            <div className="text-xs uppercase tracking-[0.14em] text-white/55">How reports are handled</div>
            <div className="mt-4 space-y-3">
              <ProcessRow title="1. Report received" body="Submission enters the abuse review pipeline." />
              <ProcessRow title="2. Admin review" body="Owner/admin moderation verifies context and risk." />
              <ProcessRow title="3. Containment" body="Risky content may be blocked, revoked, or quarantined." />
              <ProcessRow title="4. Security logging" body="Events are logged for audit and operational follow-up." />
            </div>
          </div>
        </div>
      </section>

      <section className="mt-12 grid gap-4 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-8">
          <ReportForm />
        </div>

        <aside className="space-y-4 lg:col-span-4">
          <div className="glass-card rounded-3xl p-6">
            <h2 className="text-lg font-semibold tracking-tight text-white">What you can report</h2>
            <ul className="mt-4 space-y-2 text-sm text-white/72">
              <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-sky-200/70" />Malware or suspicious file behavior</li>
              <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-sky-200/70" />Phishing or impersonation attempts</li>
              <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-sky-200/70" />Illegal or prohibited content</li>
              <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-sky-200/70" />Policy abuse or suspicious sharing patterns</li>
            </ul>
          </div>

          <div className="glass-card rounded-3xl p-6">
            <h2 className="text-lg font-semibold tracking-tight text-white">Before you submit</h2>
            <ul className="mt-4 space-y-2 text-sm text-white/72">
              <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-sky-200/70" />Include token, alias, or share link when possible.</li>
              <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-sky-200/70" />Describe what you observed and why it is risky.</li>
              <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-sky-200/70" />Include timing and whether you clicked or downloaded anything.</li>
            </ul>
          </div>

          <div className="glass-card rounded-3xl p-6">
            <h2 className="text-lg font-semibold tracking-tight text-white">Related trust links</h2>
            <div className="mt-4 grid gap-2 text-sm">
              <Link href="/acceptable-use" className="text-white/80 underline underline-offset-4 hover:text-white">Acceptable Use Policy</Link>
              <Link href="/privacy" className="text-white/80 underline underline-offset-4 hover:text-white">Privacy Policy</Link>
              <Link href="/security-disclosure" className="text-white/80 underline underline-offset-4 hover:text-white">Security Disclosure</Link>
              <Link href="/status" className="text-white/80 underline underline-offset-4 hover:text-white">Status Center</Link>
              <Link href="/contact" className="text-white/80 underline underline-offset-4 hover:text-white">Contact</Link>
            </div>
          </div>
        </aside>
      </section>
    </SiteShell>
  );
}

function ProcessRow(props: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-black/25 p-4">
      <div className="text-sm font-medium text-white/92">{props.title}</div>
      <div className="mt-1 text-xs leading-relaxed text-white/64">{props.body}</div>
    </div>
  );
}
