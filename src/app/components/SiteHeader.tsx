// app/components/SiteHeader.tsx
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="glass-card-strong sticky top-2 z-40 rounded-2xl px-3 py-3 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl border border-white/20 bg-white/10">
            <span className="text-sm font-semibold tracking-tight text-white">CY</span>
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-white">cyang.io</div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-white/50">Projects</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 text-sm md:flex">
          <Link href="/projects" className="btn-base btn-secondary rounded-lg px-3 py-1.5">
            Projects
          </Link>
          <Link href="/projects/doclinks" className="btn-base btn-secondary rounded-lg px-3 py-1.5">
            Doclinks
          </Link>
          <Link href="/about" className="btn-base btn-secondary rounded-lg px-3 py-1.5">
            About
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/admin" className="btn-base btn-primary rounded-xl px-4 py-2 text-sm font-medium">
            Admin
          </Link>
        </div>
      </div>
    </header>
  );
}
