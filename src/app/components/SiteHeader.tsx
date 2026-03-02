// app/components/SiteHeader.tsx
import Link from "next/link";
import { getBillingFlags } from "@/lib/settings";

export async function SiteHeader() {
  const flagsRes = await getBillingFlags();
  const showPricingUi = flagsRes.flags.pricingUiEnabled;

  return (
    <header className="glass-card-strong ui-sheen sticky top-2 z-40 rounded-2xl px-4 py-3 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/20 bg-white/10 p-1.5">
            <img src="/branding/cyang_primary.svg" alt="cyang.io" className="h-full w-full object-contain" />
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight text-white">cyang.io</div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/50">Systems & Products</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-1.5 text-sm md:flex">
          <Link href="/projects" className="btn-base btn-secondary rounded-lg px-3.5 py-2">
            Projects
          </Link>
          <Link href="/projects/doclinks" className="btn-base btn-secondary rounded-lg px-3.5 py-2">
            Doclinks
          </Link>
          {showPricingUi ? (
            <Link href="/pricing" className="btn-base btn-secondary rounded-lg px-3.5 py-2">
              Pricing
            </Link>
          ) : null}
          <Link href="/about" className="btn-base btn-secondary rounded-lg px-3.5 py-2">
            About
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/signin"
            className="btn-base inline-flex rounded-xl border border-sky-200/70 bg-gradient-to-r from-sky-300 to-blue-200 px-4 py-2.5 text-sm font-semibold text-black shadow-[0_8px_24px_rgba(83,177,255,0.32)] hover:brightness-105"
          >
            Sign in
          </Link>
          <Link href="/signup" className="btn-base btn-primary rounded-xl px-4 py-2.5 text-sm font-semibold">
            Sign up
          </Link>
        </div>
      </div>
    </header>
  );
}
