"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { VIEWER_NAV_ITEMS, type ViewerIconName, type ViewerNavItem } from "./viewerNavigation";
import type { ViewerShellContext } from "./viewerShellData";

type ViewerShellProps = {
  email?: string | null;
  context: ViewerShellContext;
  children: React.ReactNode;
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function toneClass(tone: "default" | "warning" | "danger") {
  if (tone === "danger") return "border-rose-400/35 bg-rose-400/14 text-rose-100";
  if (tone === "warning") return "border-amber-300/35 bg-amber-300/12 text-amber-100";
  return "border-white/15 bg-white/[0.05] text-white/78";
}

function iconPath(name: ViewerIconName) {
  switch (name) {
    case "overview":
      return "M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z";
    case "documents":
      return "M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm7 1.5V9h4.5";
    case "links":
      return "M10.8 13.2 13.2 10.8m-5.9 5.9L5.6 18.4a3.2 3.2 0 1 1-4.5-4.5l3.7-3.7a3.2 3.2 0 0 1 4.5 0m5.9-5.9 1.7-1.7a3.2 3.2 0 1 1 4.5 4.5l-3.7 3.7a3.2 3.2 0 0 1-4.5 0";
    case "activity":
      return "M4 18h16M6.5 15.5l3.3-4.2 3.1 2.5L17.5 7";
    case "help":
      return "M12 18.5h.01M9.1 9.5a2.9 2.9 0 1 1 5.2 1.8c-.8.9-1.6 1.4-1.6 2.7";
    case "profile":
      return "M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-7 8a7 7 0 0 1 14 0";
    default:
      return "M4 12h16";
  }
}

function ViewerIcon({ name }: { name: ViewerIconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden="true">
      <path d={iconPath(name)} />
    </svg>
  );
}

function NavBadge({
  badge,
}: {
  badge?: { tone: "default" | "warning" | "danger"; value: string };
}) {
  if (!badge) return null;
  return (
    <span className={["inline-flex min-w-6 items-center justify-center rounded-full border px-1.5 py-0.5 text-[11px] font-semibold", toneClass(badge.tone)].join(" ")}>
      {badge.value}
    </span>
  );
}

function NavRow({
  item,
  pathname,
  badge,
  onNavigate,
}: {
  item: ViewerNavItem;
  pathname: string;
  badge?: { tone: "default" | "warning" | "danger"; value: string };
  onNavigate?: () => void;
}) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={[
        "group relative flex items-center gap-3 rounded-2xl border px-3 py-3 transition",
        active
          ? "border-cyan-300/28 bg-[linear-gradient(135deg,rgba(79,213,203,0.14),rgba(111,167,255,0.12))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          : "border-transparent bg-transparent text-white/68 hover:border-white/10 hover:bg-white/[0.04] hover:text-white",
      ].join(" ")}
    >
      {active ? <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-cyan-300/90" /> : null}
      <span className={["flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border", active ? "border-cyan-300/20 bg-cyan-300/12 text-cyan-100" : "border-white/10 bg-white/[0.04] text-white/72 group-hover:border-white/16 group-hover:text-white"].join(" ")}>
        <ViewerIcon name={item.icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.label}</span>
        <span className="mt-0.5 block truncate text-xs text-white/45">{item.description}</span>
      </span>
      <NavBadge badge={badge} />
    </Link>
  );
}

export default function ViewerShell(props: ViewerShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentItem = useMemo(
    () => VIEWER_NAV_ITEMS.find((item) => isActive(pathname, item.href)) ?? VIEWER_NAV_ITEMS[0] ?? null,
    [pathname]
  );

  const navContent = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 px-5 pb-5">
        <div className="flex items-center gap-3 rounded-[24px] border border-white/10 bg-white/[0.03] p-3.5">
          <img src="/branding/cyang_primary.svg" alt="cyang.io" className="h-10 w-10 rounded-2xl border border-white/10 bg-[#07131f] p-1.5" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-tight text-white">{props.context.workspaceName}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-white/55">
                {props.context.roleLabel}
              </span>
              <span className="rounded-full border border-cyan-300/18 bg-cyan-300/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-cyan-100">
                {props.context.planLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-[24px] border border-cyan-300/18 bg-[linear-gradient(135deg,rgba(79,213,203,0.13),rgba(111,167,255,0.1))] p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-cyan-100/80">Member workflow</div>
          <div className="mt-2 text-sm font-medium text-white">Upload, create a protected link, and track recipient activity from one workspace.</div>
          <div className="mt-3 flex gap-2">
            <Link
              href="/viewer/documents?openPicker=1"
              onClick={onNavigate}
              className="btn-base inline-flex rounded-xl border border-cyan-300/35 bg-cyan-300 px-3 py-2 text-xs font-semibold text-[#07131f] hover:bg-cyan-200"
            >
              Upload
            </Link>
            <Link
              href="/viewer/links"
              onClick={onNavigate}
              className="btn-base inline-flex rounded-xl border border-white/12 bg-white/[0.08] px-3 py-2 text-xs text-white/82 hover:bg-white/[0.12]"
            >
              Links
            </Link>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-auto px-3 py-4">
        {VIEWER_NAV_ITEMS.map((item) => (
          <NavRow
            key={item.key}
            item={item}
            pathname={pathname}
            badge={props.context.badges[item.key as keyof typeof props.context.badges]}
            onNavigate={onNavigate}
          />
        ))}
      </div>

      <div className="border-t border-white/10 px-4 pt-4">
        <div className="space-y-2">
          <Link href="/security-disclosure" onClick={onNavigate} className="flex items-center gap-3 rounded-2xl border border-transparent px-3 py-2 text-sm text-white/64 hover:border-white/10 hover:bg-white/[0.04] hover:text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
              <ViewerIcon name="help" />
            </span>
            <span className="flex-1">Help & Security</span>
          </Link>
        </div>

        <div className="mt-3 rounded-[24px] border border-white/10 bg-white/[0.03] p-3.5">
          <div className="text-[11px] uppercase tracking-[0.16em] text-white/38">Signed in</div>
          <div className="mt-2 truncate text-sm font-medium text-white/84">{props.email || "unknown"}</div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => signOut({ callbackUrl: "/signin" })}
              className="btn-base flex-1 rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2 text-xs text-white/84 hover:bg-white/[0.1]"
            >
              Sign out
            </button>
            <Link href="/projects/doclinks" className="btn-base rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-xs text-white/68 hover:bg-white/[0.08]">
              Site
            </Link>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app-shell min-h-screen">
      <div className="mx-auto flex w-full max-w-[2200px] gap-4 px-3 py-4 sm:px-4 lg:gap-6 lg:px-6 xl:px-8">
        <aside className="glass-card-strong hidden w-[310px] shrink-0 rounded-[32px] border-white/12 p-3 md:flex md:flex-col">
          {navContent()}
        </aside>

        <div className="min-w-0 flex-1">
          <header className="glass-card-strong sticky top-2 z-40 rounded-[30px] border-white/12 px-4 py-4 md:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <button
                  type="button"
                  onClick={() => setMobileOpen(true)}
                  className="btn-base btn-secondary mt-0.5 inline-flex rounded-xl px-3 py-2 text-sm md:hidden"
                  aria-label="Open navigation"
                >
                  Menu
                </button>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/42">
                    <span>{props.context.workspaceLabel}</span>
                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/55">
                      {props.context.roleLabel}
                    </span>
                    <span className="rounded-full border border-cyan-300/18 bg-cyan-300/10 px-2 py-0.5 text-[10px] text-cyan-100">
                      {props.context.planLabel}
                    </span>
                  </div>
                  <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight text-white">
                    {currentItem?.label || "Member workspace"}
                  </h1>
                  <p className="mt-1 max-w-3xl text-sm text-white/58">
                    {currentItem?.description || "Secure document access, protected links, and clear recipient workflows."}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link href="/viewer/links" className="btn-base rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/78 hover:bg-white/[0.08]">
                  Open links
                </Link>
                <Link href="/viewer/documents?openPicker=1" className="btn-base rounded-xl border border-cyan-300/38 bg-cyan-300 px-3.5 py-2 text-sm font-semibold text-[#07131f] hover:bg-cyan-200">
                  Upload Documents
                </Link>
              </div>
            </div>
          </header>

          <main className="pt-5">{props.children}</main>
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button type="button" className="absolute inset-0 bg-black/68" onClick={() => setMobileOpen(false)} aria-label="Close navigation backdrop" />
          <div className="glass-card-strong absolute inset-y-2 left-2 w-[88%] max-w-sm rounded-[30px] p-3">
            {navContent(() => setMobileOpen(false))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
