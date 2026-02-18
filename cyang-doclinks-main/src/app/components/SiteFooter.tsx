// app/components/SiteFooter.tsx
import Link from "next/link";

export function SiteFooter() {
    return (
        <footer className="mt-20 border-t border-white/10 py-10 text-sm text-white/60">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <p>© {new Date().getFullYear()} Chang Yang</p>
                <div className="flex gap-6">
                    <Link href="/" className="hover:text-white">
                        Home
                    </Link>
                    <Link href="/projects" className="hover:text-white">
                        Projects
                    </Link>
                    <Link href="/projects/doclinks" className="hover:text-white">
                        Doclinks
                    </Link>
                    <Link href="/about" className="hover:text-white">
                        About
                    </Link>
                </div>
            </div>
        </footer>
    );
}
