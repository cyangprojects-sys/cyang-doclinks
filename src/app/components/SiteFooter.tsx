import Link from "next/link";
import type { PublicRuntimeConfig } from "@/lib/publicRuntimeConfig";

const FOOTER_GROUPS = [
  {
    title: "Products",
    links: [
      { href: "/doclinks", label: "Doclinks" },
      { href: "/products", label: "Products" },
      { href: "/signup", label: "Get started" },
    ],
  },
  {
    title: "Platform",
    links: [
      { href: "/status", label: "Status" },
      { href: "/trust/procurement", label: "Procurement Package" },
      { href: "/data-retention", label: "Data Retention" },
      { href: "/report", label: "Report Abuse" },
    ],
  },
  {
    title: "Trust",
    links: [
      { href: "/trust", label: "Trust Center" },
      { href: "/legal/security-policy", label: "Security Policy" },
      { href: "/security-disclosure", label: "Security Disclosure" },
      { href: "/legal/subprocessors", label: "Subprocessors" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/legal", label: "Legal Center" },
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
      { href: "/acceptable-use", label: "Acceptable Use" },
      { href: "/legal/data-processing-addendum", label: "DPA" },
      { href: "/legal/service-level-agreement", label: "SLA" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/products", label: "Products and Systems" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Support",
    links: [
      { href: "/signin", label: "Sign in" },
      { href: "/contact", label: "Contact Routing" },
      { href: "/status", label: "Operational Status" },
      { href: "/report", label: "Safety Reporting" },
    ],
  },
] as const;

export function SiteFooter({ config }: { config: PublicRuntimeConfig }) {
  const groups = FOOTER_GROUPS.map((group) => {
    if (group.title !== "Products" || config.signupEnabled) return group;
    return {
      ...group,
      links: group.links.filter((link) => link.href !== "/signup"),
    };
  });

  return (
    <footer className="mt-20 pb-10 sm:mt-24">
      <div className="surface-panel rounded-sm px-5 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(6,minmax(0,1fr))]">
          <div>
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-sm border border-white/12 bg-white/[0.05] p-2">
                <img src="/branding/cyang_primary.svg" alt="cyang.io" className="h-full w-full object-contain" />
              </div>
              <div>
                <div className="text-base font-semibold text-white">cyang.io</div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-white/36">Premium trust shell</div>
              </div>
            </div>

            <p className="mt-5 max-w-xs text-sm leading-7 text-white/62">
              Quietly powerful infrastructure for secure workflows, controlled delivery, and reviewable operations.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              <a href={`mailto:${config.supportEmail}`} className="btn-base btn-secondary inline-flex rounded-sm px-3 py-2 text-xs">
                {config.supportEmail}
              </a>
              <a href={`mailto:${config.securityEmail}`} className="btn-base btn-secondary inline-flex rounded-sm px-3 py-2 text-xs">
                Security
              </a>
            </div>
          </div>

          {groups.map((group) => (
            <div key={group.title}>
              <div className="text-[11px] uppercase tracking-[0.22em] text-white/58">{group.title}</div>
              <div className="mt-4 grid gap-2">
                {group.links.map((link) => (
                  <Link key={`${group.title}-${link.href}`} href={link.href} className="text-sm text-white/66 transition-colors hover:text-white">
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 border-t border-white/8 pt-4 text-xs text-white/48 sm:flex sm:items-center sm:justify-between">
          <p>Copyright {new Date().getFullYear()} cyang.io. All rights reserved.</p>
          <p className="mt-2 sm:mt-0">Cyang.io Proprietary License remains in effect.</p>
        </div>
      </div>
    </footer>
  );
}
