"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { PublicRuntimeConfig } from "@/lib/publicRuntimeConfig";

const PRIMARY_NAV = [
  { href: "/products", label: "Products" },
  { href: "/doclinks", label: "Doclinks" },
  { href: "/trust", label: "Trust" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

function isCurrent(pathname: string, href: string) {
  if (href === "/products") {
    return pathname === "/products" || pathname.startsWith("/products/") || pathname === "/projects" || pathname.startsWith("/projects/");
  }

  if (href === "/doclinks") {
    return pathname === "/doclinks" || pathname.startsWith("/doclinks/") || pathname === "/projects/doclinks" || pathname.startsWith("/projects/doclinks/");
  }

  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SiteHeaderClient({ config }: { config: PublicRuntimeConfig }) {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastScroll = 0;

    function onScroll() {
      const current = window.scrollY;
      const shouldHide = current > 96 && current > lastScroll;
      setHidden(shouldHide);
      lastScroll = current;
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={[
        "sticky top-3 z-50 transition-transform duration-300",
        hidden ? "-translate-y-[120%]" : "translate-y-0",
      ].join(" ")}
    >
      <header className="surface-panel-strong nav-satin rounded-sm px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-sm border border-white/12 bg-white/[0.045] p-2 shadow-[0_10px_24px_rgba(25,38,52,0.12)]">
              <img src="/branding/cyang_primary.svg" alt="cyang.io" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-tight text-white sm:text-base">cyang.io</div>
              <div className="truncate text-[10px] uppercase tracking-[0.24em] text-white/60 sm:text-[11px]">
                Secure workflow software
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-1.5 lg:flex">
            {PRIMARY_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "btn-base rounded-sm px-3.5 py-2 text-sm",
                  isCurrent(pathname, item.href) ? "bg-white/10 text-white" : "btn-ghost",
                ].join(" ")}
                aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/signin" className="btn-base btn-secondary inline-flex rounded-sm px-4 py-2.5 text-sm font-medium">
              Sign in
            </Link>
            {config.signupEnabled ? (
              <Link href="/signup" className="btn-base btn-primary inline-flex rounded-sm px-4 py-2.5 text-sm font-medium">
                Get started
              </Link>
            ) : null}
          </div>
        </div>

        <nav className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 lg:hidden">
          {PRIMARY_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "btn-base rounded-sm px-3 py-1.5 text-xs whitespace-nowrap",
                isCurrent(pathname, item.href) ? "bg-white/10 text-white" : "btn-ghost",
              ].join(" ")}
              aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
    </div>
  );
}
