// app/components/SiteFooter.tsx
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 sm:mt-20">
      <div className="glass-card rounded-2xl px-4 py-5 text-sm text-white/65 sm:px-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <p>Copyright {new Date().getFullYear()} Chang Yang</p>
          <div className="flex flex-wrap gap-3 text-xs sm:text-sm">
            <Link href="/" className="hover:text-white">Home</Link>
            <Link href="/projects" className="hover:text-white">Projects</Link>
            <Link href="/projects/doclinks" className="hover:text-white">Doclinks</Link>
            <Link href="/about" className="hover:text-white">About</Link>
            <Link href="/terms" className="hover:text-white">Terms</Link>
            <Link href="/acceptable-use" className="hover:text-white">Acceptable Use</Link>
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/data-retention" className="hover:text-white">Data Retention</Link>
            <Link href="/security-disclosure" className="hover:text-white">Security Disclosure</Link>
            <Link href="/report" className="hover:text-white">Report</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
