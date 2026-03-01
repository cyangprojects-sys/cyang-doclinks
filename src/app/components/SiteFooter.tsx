// app/components/SiteFooter.tsx
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-18 sm:mt-24">
      <div className="glass-card rounded-2xl px-5 py-6 text-sm text-white/65 sm:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <p className="text-white/60">Copyright {new Date().getFullYear()} cyang.io</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs sm:text-sm">
            <Link href="/" className="transition-colors hover:text-white">Home</Link>
            <Link href="/projects" className="transition-colors hover:text-white">Projects</Link>
            <Link href="/projects/doclinks" className="transition-colors hover:text-white">Doclinks</Link>
            <Link href="/pricing" className="transition-colors hover:text-white">Pricing</Link>
            <Link href="/about" className="transition-colors hover:text-white">About</Link>
            <Link href="/terms" className="transition-colors hover:text-white">Terms</Link>
            <Link href="/acceptable-use" className="transition-colors hover:text-white">Acceptable Use</Link>
            <Link href="/privacy" className="transition-colors hover:text-white">Privacy</Link>
            <Link href="/data-retention" className="transition-colors hover:text-white">Data Retention</Link>
            <Link href="/security-disclosure" className="transition-colors hover:text-white">Security Disclosure</Link>
            <Link href="/report" className="transition-colors hover:text-white">Report</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
