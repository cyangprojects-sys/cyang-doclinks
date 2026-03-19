import Link from "next/link";
import { PolicyPageShell } from "@/app/components/PolicyPageShell";
import { PremiumCard, Section } from "@/app/components/PublicPrimitives";

export function StatusPageIntro() {
  return (
    <PolicyPageShell
      breadcrumbs={[
        { label: "cyang.io", href: "/" },
        { label: "Trust", href: "/trust" },
        { label: "Status" },
      ]}
      eyebrow="Status"
      title="System status and operational updates."
      body="Live health, availability posture, and incident communication for cyang.io services. This page favors clear public signals without turning every read into expensive dependency fan-out."
      meta={[
        { label: "Snapshot type", value: "Cached public health summary" },
        { label: "Use case", value: "Operational visibility and customer confidence" },
      ]}
    />
  );
}

export function StatusPageResources() {
  return (
    <Section className="pt-0">
      <PremiumCard>
        <div className="text-xl font-semibold text-white">Related trust resources</div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Link href="/trust" className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/76 transition-colors hover:bg-white/[0.06] hover:text-white">
            Trust Center
          </Link>
          <Link href="/trust/procurement" className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/76 transition-colors hover:bg-white/[0.06] hover:text-white">
            Procurement package
          </Link>
          <Link href="/legal/security-policy" className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/76 transition-colors hover:bg-white/[0.06] hover:text-white">
            Security Policy
          </Link>
          <Link href="/legal/service-level-agreement" className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/76 transition-colors hover:bg-white/[0.06] hover:text-white">
            SLA
          </Link>
          <Link href="/report" className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/76 transition-colors hover:bg-white/[0.06] hover:text-white">
            Report abuse
          </Link>
          <Link href="/contact" className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/76 transition-colors hover:bg-white/[0.06] hover:text-white">
            Contact
          </Link>
        </div>
      </PremiumCard>
    </Section>
  );
}
