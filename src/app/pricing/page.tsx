import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "../components/SiteShell";
import { getBillingFlags } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Pricing - Doclinks",
  description:
    "Detailed Free vs Pro plan comparison for Doclinks secure document delivery.",
};

const COMPARISON_ROWS: Array<{ feature: string; free: string; pro: string }> = [
  { feature: "Price", free: "$0/month", pro: "$12/month" },
  { feature: "Max file upload", free: "25 MB", pro: "100 MB" },
  { feature: "Total storage", free: "100 MB", pro: "5 GB" },
  { feature: "Active shares", free: "3", pro: "Unlimited (soft cap monitored)" },
  { feature: "Views", free: "100/month", pro: "Unlimited (soft monitored)" },
  { feature: "Share expiration", free: "Required, up to 7 days", pro: "Custom expiration controls" },
  { feature: "Permanent shares", free: "Not available", pro: "Available with policy controls" },
  { feature: "Allow download toggle", free: "Available, policy-enforced", pro: "Available, policy-enforced" },
  { feature: "Audit visibility", free: "Basic activity visibility", pro: "Audit export + expanded visibility" },
  { feature: "API + webhooks", free: "Not included", pro: "Included" },
  { feature: "Abuse throttling", free: "Strict", pro: "Standard (monitored)" },
  { feature: "Encryption", free: "Required", pro: "Required" },
  { feature: "Virus scanning", free: "Required before delivery", pro: "Required before delivery" },
];

export default async function PricingPage() {
  const flagsRes = await getBillingFlags();
  if (!flagsRes.flags.pricingUiEnabled) {
    notFound();
  }

  return (
    <SiteShell maxWidth="full">
      <section className="relative mt-16">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-24 left-20 h-64 w-64 rounded-full bg-sky-500/12 blur-3xl" />
          <div className="absolute -bottom-32 right-10 h-80 w-80 rounded-full bg-amber-400/10 blur-3xl" />
        </div>

        <p className="inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-xs text-white/70 ring-1 ring-white/10">
          Doclinks pricing
        </p>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-5xl">
          Free vs Pro
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/70">
          Controlled delivery infrastructure with transparent plan boundaries. No hidden math.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <article className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
            <div className="inline-flex items-center rounded-lg border border-sky-200/70 bg-gradient-to-r from-sky-300 to-cyan-200 px-3 py-1.5 text-sm font-semibold text-black shadow-[0_8px_24px_rgba(73,179,255,0.30)]">
              Free - $0/month
            </div>
            <p className="mt-4 text-sm text-white/75">
              For individuals and small teams validating controlled delivery workflows.
            </p>
            <Link
              href="/signin"
              className="btn-base mt-5 inline-flex rounded-lg border border-sky-200/70 bg-gradient-to-r from-sky-300 to-cyan-200 px-4 py-2.5 text-sm font-semibold text-black shadow-[0_8px_24px_rgba(73,179,255,0.30)] hover:brightness-105"
            >
              Start Free
            </Link>
          </article>

          <article className="rounded-3xl border border-amber-300/40 bg-white/5 p-6 ring-1 ring-amber-200/15">
            <div className="inline-flex items-center rounded-lg border border-amber-200/70 bg-gradient-to-r from-amber-300 to-amber-200 px-3 py-1.5 text-sm font-semibold text-black shadow-[0_8px_24px_rgba(232,194,122,0.32)]">
              Pro - $12/month
            </div>
            <p className="mt-4 text-sm text-white/85">
              For teams needing higher throughput, richer controls, and audit-grade visibility.
            </p>
            <Link
              href="/admin/upgrade"
              className="btn-base mt-5 inline-flex rounded-lg border border-amber-200/70 bg-gradient-to-r from-amber-300 to-amber-200 px-4 py-2.5 text-sm font-semibold text-black shadow-[0_8px_24px_rgba(232,194,122,0.32)] hover:brightness-105"
            >
              Upgrade to Pro
            </Link>
          </article>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight">Detailed Comparison</h2>
        <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-white/5 text-white/85">
              <tr>
                <th className="px-4 py-3 font-semibold">Capability</th>
                <th className="px-4 py-3 font-semibold">Free</th>
                <th className="px-4 py-3 font-semibold">Pro</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.feature} className="border-t border-white/10">
                  <td className="px-4 py-3 text-white/85">{row.feature}</td>
                  <td className="px-4 py-3 text-white/70">{row.free}</td>
                  <td className="px-4 py-3 text-white/85">{row.pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-white/55">
          Soft monitoring thresholds are used for anti-abuse and operational health controls.
        </p>
      </section>
    </SiteShell>
  );
}
