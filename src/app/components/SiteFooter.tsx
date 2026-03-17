// app/components/SiteFooter.tsx
import Link from "next/link";
import type { PublicRuntimeConfig } from "@/lib/publicRuntimeConfig";

export function SiteFooter({ config }: { config: PublicRuntimeConfig }) {
  const showPricingUi = config.showPricingUi;

  return (
    <footer className="mt-18 sm:mt-24">
      <div className="glass-card rounded-2xl px-5 py-7 text-sm text-white/65 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[1.15fr_repeat(5,minmax(0,1fr))]">
          <div>
            <div className="text-base font-semibold text-white">cyang.io</div>
            <p className="mt-2 max-w-xs text-xs leading-relaxed text-white/58">
              Practical software for secure workflows, controlled sharing, and operational clarity.
            </p>
          </div>

          <FooterGroup
            title="Product"
            links={[
              { href: "/projects/doclinks", label: "Doclinks" },
              { href: "/projects", label: "Products" },
              ...(showPricingUi ? [{ href: "/pricing", label: "Pricing" }] : []),
              { href: "/signup", label: "Get started" },
            ]}
          />

          <FooterGroup
            title="Trust"
            links={[
              { href: "/trust", label: "Trust Center" },
              { href: "/trust/procurement", label: "Procurement Package" },
              { href: "/legal/security-policy", label: "Security Policy" },
              { href: "/status", label: "Status" },
              { href: "/security-disclosure", label: "Security Disclosure" },
              { href: "/report", label: "Report abuse" },
            ]}
          />

          <FooterGroup
            title="Company"
            links={[
              { href: "/about", label: "About" },
              { href: "/projects", label: "Products and systems" },
            ]}
          />

          <FooterGroup
            title="Legal"
            links={[
              { href: "/legal", label: "Legal Center" },
              { href: "/terms", label: "Terms" },
              { href: "/privacy", label: "Privacy" },
              { href: "/acceptable-use", label: "Acceptable Use" },
              { href: "/legal/dmca-policy", label: "DMCA" },
            ]}
          />

          <FooterGroup
            title="Support"
            links={[
              { href: "/contact", label: "Contact" },
              { href: "/data-retention", label: "Data Retention" },
              { href: "/legal/data-processing-addendum", label: "DPA" },
              { href: "/legal/service-level-agreement", label: "SLA" },
              { href: "/legal/subprocessors", label: "Subprocessors" },
            ]}
          />
        </div>

        <div className="mt-7 border-t border-white/10 pt-4 text-xs text-white/52">
          <p>Copyright {new Date().getFullYear()} cyang.io</p>
        </div>
      </div>
    </footer>
  );
}

function FooterGroup(props: { title: string; links: Array<{ href: string; label: string }> }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.14em] text-white/48">{props.title}</div>
      <div className="mt-2 grid gap-1.5">
        {props.links.map((link) => (
          <Link key={`${props.title}-${link.href}`} href={link.href} className="text-sm text-white/66 transition-colors hover:text-white">
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
