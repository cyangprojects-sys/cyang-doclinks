import Link from "next/link";
import type { PublicRuntimeConfig } from "@/lib/publicRuntimeConfig";

export function SiteHeader({ config }: { config: PublicRuntimeConfig }) {
  const showPricingUi = config.showPricingUi;
  const signupEnabled = config.signupEnabled;

  return (
    <header className="glass-card-strong ui-sheen sticky top-2 z-40 rounded-2xl px-4 py-3 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/20 bg-white/10 p-1.5 shadow-[0_8px_22px_rgba(23,44,86,0.35)]">
            <img src="/branding/cyang_primary.svg" alt="cyang.io" className="h-full w-full object-contain" />
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight text-white">cyang.io</div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/50">Secure Workflow Software</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-1.5 text-sm lg:flex">
          <HeaderLink href="/projects">Products</HeaderLink>
          <Link href="/projects/doclinks" className="btn-base btn-secondary inline-flex items-center gap-2 rounded-lg px-3.5 py-2">
            <span>Doclinks</span>
            <span className="rounded-full border border-sky-200/30 bg-sky-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-sky-100/85">
              Featured
            </span>
          </Link>
          {showPricingUi ? <HeaderLink href="/pricing">Pricing</HeaderLink> : null}
          <HeaderLink href="/trust">Trust</HeaderLink>
          <HeaderLink href="/about">About</HeaderLink>
          <HeaderLink href="/contact">Contact</HeaderLink>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/signin"
            className="btn-base btn-secondary inline-flex rounded-xl px-4 py-2.5 text-sm font-semibold"
          >
            Sign in
          </Link>
          {signupEnabled ? (
            <Link href="/signup" className="btn-base btn-primary rounded-xl px-4 py-2.5 text-sm font-semibold">
              Get started
            </Link>
          ) : null}
        </div>
      </div>

      <nav className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 text-xs lg:hidden">
        <HeaderLink href="/projects">Products</HeaderLink>
        <Link href="/projects/doclinks" className="btn-base btn-secondary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 whitespace-nowrap">
          <span>Doclinks</span>
          <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
        </Link>
        {showPricingUi ? <HeaderLink href="/pricing">Pricing</HeaderLink> : null}
        <HeaderLink href="/trust">Trust</HeaderLink>
        <HeaderLink href="/about">About</HeaderLink>
        <HeaderLink href="/contact">Contact</HeaderLink>
      </nav>
    </header>
  );
}

function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="btn-base btn-secondary rounded-lg px-3.5 py-2 whitespace-nowrap">
      {children}
    </Link>
  );
}
