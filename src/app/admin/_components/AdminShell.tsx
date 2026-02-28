"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useMemo, useState } from "react";

type AdminShellProps = {
  email?: string | null;
  isOwner: boolean;
  showPricingUi: boolean;
  children: React.ReactNode;
};

type NavItem = {
  href: string;
  label: string;
  ownerOnly?: boolean;
  pricingOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/upload", label: "Uploads" },
  { href: "/admin/dashboard#shares", label: "Shares" },
  { href: "/admin/upgrade", label: "Upgrade", pricingOnly: true },
  { href: "/admin/viewer-uploads", label: "Viewer Uploads", ownerOnly: true },
  { href: "/admin/audit", label: "Audit", ownerOnly: true },
  { href: "/admin/security", label: "Security", ownerOnly: true },
  { href: "/admin/api-keys", label: "Keys", ownerOnly: true },
  { href: "/admin/billing", label: "Billing", ownerOnly: true },
  { href: "/admin/billing/stripe", label: "Stripe", ownerOnly: true },
  { href: "/admin/webhooks", label: "Webhooks", ownerOnly: true },
  { href: "/admin/abuse", label: "Abuse", ownerOnly: true },
  { href: "/admin/dmca", label: "DMCA", ownerOnly: true },
  { href: "/admin/db-debug", label: "DB Debug", ownerOnly: true },
  { href: "/admin/debug", label: "Debug", ownerOnly: true },
];

function isActive(pathname: string, href: string) {
  const route = href.split("#")[0];
  return pathname === route || pathname.startsWith(`${route}/`);
}

export default function AdminShell({ email, isOwner, showPricingUi, children }: AdminShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const visibleItems = useMemo(
    () =>
      NAV_ITEMS.filter((item) => {
        if (item.ownerOnly && !isOwner) return false;
        if (item.pricingOnly && !showPricingUi) return false;
        return true;
      }),
    [isOwner, showPricingUi]
  );

  const currentTitle = useMemo(() => {
    const hit = visibleItems.find((item) => isActive(pathname, item.href));
    return hit?.label || "Admin";
  }, [pathname, visibleItems]);

  return (
    <div className="app-shell min-h-screen">
      <div className="mx-auto flex w-full max-w-[1320px] gap-6 px-3 py-3 md:px-5 md:py-5">
        <aside className="glass-card-strong hidden w-72 shrink-0 overflow-hidden rounded-2xl md:flex md:flex-col">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="flex items-center gap-2">
              <img src="/branding/cyang_primary.svg" alt="cyang.io" className="h-6 w-6 object-contain" />
              <div className="text-sm font-semibold tracking-tight text-white">cyang.io/doclinks</div>
            </div>
            <div className="mt-1 text-xs uppercase tracking-[0.12em] text-white/55">Admin</div>
          </div>
          <nav className="flex-1 space-y-1 px-3 py-3">
            {visibleItems.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={[
                    "btn-base relative flex items-center rounded-xl px-3 py-2.5 text-sm",
                    active
                      ? "border border-white/20 bg-gradient-to-r from-blue-400/20 to-cyan-300/15 text-white"
                      : "border border-transparent text-white/75 hover:border-white/15 hover:bg-white/5 hover:text-white",
                  ].join(" ")}
                >
                  {active ? <span className="mr-2 inline-block h-5 w-0.5 rounded bg-cyan-300/90" /> : null}
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-white/10 px-4 py-3 text-xs text-white/60">
            <div className="truncate">Signed in as {email || "unknown"}</div>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="btn-base btn-secondary rounded-lg px-2.5 py-1.5 text-xs"
              >
                Log out
              </button>
              <Link href="/" className="btn-base btn-secondary rounded-lg px-2.5 py-1.5 text-xs">
                Home
              </Link>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="glass-card-strong sticky top-2 z-30 rounded-2xl px-3 py-3 md:px-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMenuOpen(true)}
                  className="btn-base btn-secondary rounded-lg px-2.5 py-1.5 text-sm md:hidden"
                  aria-label="Open menu"
                >
                  Menu
                </button>
                <div>
                  <h1 className="text-sm font-semibold tracking-tight text-white md:text-base">{currentTitle}</h1>
                  <p className="hidden text-xs text-white/60 md:block">Secure document operations console</p>
                </div>
              </div>
              <div className="hidden items-center gap-2 md:flex">
                <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/70">
                  {email || "unknown"}
                </span>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="btn-base btn-secondary rounded-lg px-3 py-1.5 text-xs"
                >
                  Sign out
                </button>
              </div>
            </div>
          </header>

          <main className="pt-4">{children}</main>
        </div>
      </div>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            className="absolute inset-0 bg-black/55"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu backdrop"
          />
          <div className="glass-card-strong absolute left-2 top-2 h-[calc(100%-1rem)] w-[82%] max-w-xs rounded-2xl p-3">
            <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
              <div>
                <div className="flex items-center gap-2">
                  <img src="/branding/cyang_primary.svg" alt="cyang.io" className="h-5 w-5 object-contain" />
                  <div className="text-sm font-semibold text-white">cyang.io/doclinks</div>
                </div>
                <div className="text-xs uppercase tracking-[0.12em] text-white/55">Admin</div>
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                className="btn-base btn-secondary rounded-lg px-2 py-1 text-xs"
                aria-label="Close menu"
              >
                Close
              </button>
            </div>
            <nav className="space-y-1">
              {visibleItems.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={[
                      "btn-base flex rounded-xl px-3 py-2.5 text-sm",
                      active
                        ? "border border-white/20 bg-gradient-to-r from-blue-400/20 to-cyan-300/15 text-white"
                        : "border border-transparent text-white/75 hover:border-white/15 hover:bg-white/5 hover:text-white",
                    ].join(" ")}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}
