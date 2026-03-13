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
  description: string;
  ownerOnly?: boolean;
  pricingOnly?: boolean;
};

const CUSTOMER_NAV_ITEMS: NavItem[] = [
  { href: "/admin/dashboard", label: "Home", description: "Upload, share, and keep track of what is happening." },
  { href: "/admin/documents", label: "Files", description: "Your secure file library and share-ready status." },
  { href: "/admin/links", label: "Shared links", description: "Manage active, expiring, and protected links." },
  { href: "/admin/activity", label: "Insights", description: "See views, engagement, and what people opened." },
  { href: "/admin/account", label: "Account", description: "Plan details, protection defaults, and account info." },
  { href: "/admin/upgrade", label: "Upgrade", description: "Unlock more control and higher limits.", pricingOnly: true },
];

const OWNER_PRIMARY_NAV_ITEMS: NavItem[] = [
  { href: "/admin/dashboard", label: "Home", description: "Owner overview and customer workspace." },
  { href: "/admin/documents", label: "Files", description: "Your secure file library and sharing flow." },
  { href: "/admin/links", label: "Shared links", description: "Manage protected links and delivery controls." },
  { href: "/admin/uploads", label: "Uploads", description: "Upload and inspect incoming documents." },
  { href: "/admin/activity", label: "Insights", description: "Monitor views and audience activity." },
  { href: "/admin/security", label: "Security", description: "Owner-level security controls.", ownerOnly: true },
  { href: "/admin/billing", label: "Billing", description: "Owner billing settings.", ownerOnly: true },
  { href: "/admin/webhooks", label: "Integrations", description: "Owner integrations and delivery hooks.", ownerOnly: true },
  { href: "/admin/upgrade", label: "Upgrade", description: "Plans and product upgrades.", pricingOnly: true },
];

const OWNER_ADVANCED_NAV_ITEMS: NavItem[] = [
  { href: "/admin/api-keys", label: "Keys", description: "API key management.", ownerOnly: true },
  { href: "/admin/webhooks", label: "Webhooks", description: "Webhook management.", ownerOnly: true },
  { href: "/admin/abuse", label: "Abuse", description: "Abuse review tools.", ownerOnly: true },
  { href: "/admin/dmca", label: "DMCA", description: "DMCA workflow.", ownerOnly: true },
  { href: "/admin/debug", label: "Debug", description: "Debug tooling.", ownerOnly: true },
  { href: "/admin/billing/stripe", label: "Stripe", description: "Stripe billing internals.", ownerOnly: true },
  { href: "/admin/audit", label: "Audit", description: "Audit stream.", ownerOnly: true },
  { href: "/admin/viewer-uploads", label: "Viewer uploads", description: "Owner viewer upload activity.", ownerOnly: true },
];

function isActive(pathname: string, href: string) {
  const route = href.split("#")[0];
  return pathname === route || pathname.startsWith(`${route}/`);
}

function NavList({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={[
              "btn-base relative block rounded-2xl border px-3.5 py-3",
              active
                ? "border-cyan-300/30 bg-gradient-to-r from-cyan-400/16 to-blue-400/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                : "border-transparent bg-transparent text-white/72 hover:border-white/12 hover:bg-white/[0.04] hover:text-white",
            ].join(" ")}
          >
            {active ? <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-cyan-300/90" /> : null}
            <div className="pl-1">
              <div className="text-sm font-medium">{item.label}</div>
              <div className="mt-1 text-xs text-white/50">{item.description}</div>
            </div>
          </Link>
        );
      })}
    </>
  );
}

export default function AdminShell({ email, isOwner, showPricingUi, children }: AdminShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const primaryItems = useMemo(
    () =>
      (isOwner ? OWNER_PRIMARY_NAV_ITEMS : CUSTOMER_NAV_ITEMS).filter((item) => {
        if (item.ownerOnly && !isOwner) return false;
        if (item.pricingOnly && !showPricingUi) return false;
        return true;
      }),
    [isOwner, showPricingUi]
  );

  const advancedItems = useMemo(
    () =>
      OWNER_ADVANCED_NAV_ITEMS.filter((item) => {
        if (item.ownerOnly && !isOwner) return false;
        if (item.pricingOnly && !showPricingUi) return false;
        return true;
      }),
    [isOwner, showPricingUi]
  );

  const currentItem = useMemo(() => {
    return [...primaryItems, ...advancedItems].find((item) => isActive(pathname, item.href)) || primaryItems[0];
  }, [advancedItems, pathname, primaryItems]);

  const workspaceLabel = isOwner ? "Owner workspace" : "Customer workspace";

  return (
    <div className="app-shell min-h-screen">
      <div className="mx-auto flex w-full max-w-[2200px] gap-4 px-3 py-4 sm:px-4 md:py-5 lg:gap-6 lg:px-6 xl:px-8 2xl:px-10">
        <aside className="glass-card-strong hidden w-[290px] shrink-0 overflow-hidden rounded-[28px] md:flex md:flex-col">
          <div className="border-b border-white/10 px-5 py-5">
            <div className="flex items-center gap-3">
              <img src="/branding/cyang_primary.svg" alt="cyang.io" className="h-8 w-8 object-contain" />
              <div>
                <div className="text-base font-semibold tracking-tight text-white">cyang.io/doclinks</div>
                <div className="mt-1 text-xs uppercase tracking-[0.18em] text-white/45">{workspaceLabel}</div>
              </div>
            </div>

            <div className="mt-5 rounded-[22px] border border-cyan-300/18 bg-[linear-gradient(135deg,rgba(79,213,203,0.12),rgba(111,167,255,0.08))] p-4">
              <div className="text-sm font-semibold text-white">Secure sharing, kept simple</div>
              <div className="mt-1 text-sm text-white/65">
                Upload first, wait for the scan, then share the protected link when it is ready.
              </div>
              <Link
                href="/admin/dashboard?openPicker=1"
                className="btn-base mt-4 inline-flex rounded-xl border border-cyan-300/40 bg-cyan-300 px-4 py-2 text-sm font-semibold text-[#07131f] hover:bg-cyan-200"
              >
                Upload file
              </Link>
            </div>
          </div>

          <nav className="flex-1 space-y-2 px-3 py-4">
            <NavList items={primaryItems} pathname={pathname} />

            {advancedItems.length > 0 ? (
              <details className="mt-3 rounded-2xl border border-white/10 bg-white/[0.02] p-2">
                <summary className="cursor-pointer list-none px-2 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
                  Owner tools
                </summary>
                <div className="mt-2 space-y-2 px-1 pb-1">
                  <NavList items={advancedItems} pathname={pathname} />
                </div>
              </details>
            ) : null}
          </nav>

          <div className="border-t border-white/10 px-4 py-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs text-white/60">
              <div className="text-[11px] uppercase tracking-[0.16em] text-white/40">Signed in</div>
              <div className="mt-2 truncate text-sm text-white/82">{email || "unknown"}</div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="btn-base btn-secondary rounded-xl px-3 py-2 text-xs"
                >
                  Sign out
                </button>
                <Link href="/" className="btn-base btn-secondary rounded-xl px-3 py-2 text-xs">
                  Site home
                </Link>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="glass-card-strong ui-sheen sticky top-2 z-30 rounded-[28px] px-4 py-3.5 md:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMenuOpen(true)}
                  className="btn-base btn-secondary rounded-lg px-2.5 py-1.5 text-sm md:hidden"
                  aria-label="Open menu"
                >
                  Menu
                </button>
                <div className="space-y-1">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">{workspaceLabel}</div>
                  <h1 className="text-sm font-semibold tracking-tight text-white md:text-base">{currentItem?.label || "Workspace"}</h1>
                  <p className="hidden text-xs text-white/60 md:block">{currentItem?.description || "Secure sharing made clear."}</p>
                </div>
              </div>
              <div className="hidden items-center gap-2 md:flex">
                {!isOwner ? (
                  <Link href="/admin/dashboard?openPicker=1" className="btn-base btn-secondary rounded-xl px-3 py-1.5 text-xs">
                    Upload file
                  </Link>
                ) : null}
                <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/70">
                  {email || "unknown"}
                </span>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="btn-base btn-secondary rounded-xl px-3 py-1.5 text-xs"
                >
                  Sign out
                </button>
              </div>
            </div>
          </header>

          <main className="pt-5">{children}</main>
        </div>
      </div>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            className="absolute inset-0 bg-black/55"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu backdrop"
          />
          <div className="glass-card-strong absolute left-2 top-2 h-[calc(100%-1rem)] w-[86%] max-w-sm rounded-[28px] p-3">
            <div className="mb-3 border-b border-white/10 pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <img src="/branding/cyang_primary.svg" alt="cyang.io" className="h-5 w-5 object-contain" />
                    <div className="text-sm font-semibold text-white">cyang.io/doclinks</div>
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-white/45">{workspaceLabel}</div>
                </div>
                <button
                  onClick={() => setMenuOpen(false)}
                  className="btn-base btn-secondary rounded-lg px-2 py-1 text-xs"
                  aria-label="Close menu"
                >
                  Close
                </button>
              </div>

              <Link
                href="/admin/dashboard?openPicker=1"
                onClick={() => setMenuOpen(false)}
                className="btn-base mt-4 inline-flex rounded-xl border border-cyan-300/40 bg-cyan-300 px-4 py-2 text-sm font-semibold text-[#07131f] hover:bg-cyan-200"
              >
                Upload file
              </Link>
            </div>

            <nav className="space-y-2">
              <NavList items={primaryItems} pathname={pathname} onNavigate={() => setMenuOpen(false)} />

              {advancedItems.length > 0 ? (
                <details className="mt-3 rounded-2xl border border-white/10 bg-white/[0.02] p-2">
                  <summary className="cursor-pointer list-none px-2 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
                    Owner tools
                  </summary>
                  <div className="mt-2 space-y-2 px-1 pb-1">
                    <NavList items={advancedItems} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
                  </div>
                </details>
              ) : null}
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}
