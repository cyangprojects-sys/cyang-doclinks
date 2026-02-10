// app/components/SiteHeader.tsx
import Link from "next/link";

export function SiteHeader() {
    return (
        <header className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 ring-1 ring-white/10">
                    <span className="text-sm font-semibold">CY</span>
                </div>
                <span className="text-sm tracking-wide text-white/80">cyang.io</span>
            </Link>

            <nav className="hidden items-center gap-6 text-sm text-white/70 md:flex">
                <Link href="/projects" className="hover:text-white">
                    Projects
                </Link>
                <Link href="/projects/doclinks" className="hover:text-white">
                    Doclinks
                </Link>
                <Link href="/about" className="hover:text-white">
                    About
                </Link>
            </nav>

            <div className="flex items-center gap-3">
                <Link
                    href="/admin/upload"
                    className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white/90 ring-1 ring-white/10 hover:bg-white/15"
                >
                    Admin
                </Link>
            </div>
        </header>
    );
}
