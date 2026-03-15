"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  ADMIN_NAV_GROUPS,
  getAdminNavItems,
  type AdminIconName,
  type AdminNavItem,
} from "./adminNavigation";
import type { AdminShellContext } from "./adminShellData";

type AdminShellProps = {
  email?: string | null;
  isOwner: boolean;
  showPricingUi: boolean;
  context: AdminShellContext;
  routeBase?: string;
  navItems?: AdminNavItem[];
  profileHref?: string;
  helpHref?: string;
  signOutCallbackUrl?: string;
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

function iconPath(name: AdminIconName) {
  switch (name) {
    case "overview":
      return "M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z";
    case "documents":
      return "M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm7 1.5V9h4.5";
    case "links":
      return "M10.8 13.2 13.2 10.8m-5.9 5.9L5.6 18.4a3.2 3.2 0 1 1-4.5-4.5l3.7-3.7a3.2 3.2 0 0 1 4.5 0m5.9-5.9 1.7-1.7a3.2 3.2 0 1 1 4.5 4.5l-3.7 3.7a3.2 3.2 0 0 1-4.5 0";
    case "activity":
      return "M4 18h16M6.5 15.5l3.3-4.2 3.1 2.5L17.5 7";
    case "security":
      return "M12 3 19 6v5.8c0 4.6-2.8 7.6-7 9.2-4.2-1.6-7-4.6-7-9.2V6z";
    case "team":
      return "M8 12a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Zm8 0a2.7 2.7 0 1 1 0-5.4A2.7 2.7 0 0 1 16 12ZM3.8 20a4.7 4.7 0 0 1 8.4 0m3.1 0a3.7 3.7 0 0 1 5.9-1.4";
    case "governance":
      return "M7 4h10v16H7zM9.5 8h5m-5 4h5m-5 4h3";
    case "branding":
      return "M12 4a8 8 0 1 0 8 8c0-1.3-.8-2-2.1-2h-1.3a1.7 1.7 0 0 1-1.6-2.4A2 2 0 0 0 13.1 4H12Z";
    case "settings":
      return "M12 8.5A3.5 3.5 0 1 1 8.5 12 3.5 3.5 0 0 1 12 8.5Zm0-5.5 1.1 2.4 2.7.4.7 2.7 2.4 1.1-1.2 2.5 1.2 2.5-2.4 1.1-.7 2.7-2.7.4L12 21l-1.1-2.4-2.7-.4-.7-2.7-2.4-1.1L5.3 12 4.1 9.5l2.4-1.1.7-2.7 2.7-.4z";
    case "billing":
      return "M4 7.5h16v9H4zM4 10.5h16M8 15h2.5";
    case "integrations":
      return "M8.2 8.2 5 5m0 0v4m0-4h4m10.8 10.8 3.2 3.2m0 0v-4m0 4h-4M8.2 15.8 5 19m0 0v-4m0 4h4m10.8-10.8L19 5m0 0v4m0-4h-4";
    case "review":
      return "M4 7h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm0 0 2.7-3h10.6L20 7";
    case "help":
      return "M12 18.5h.01M9.1 9.5a2.9 2.9 0 1 1 5.2 1.8c-.8.9-1.6 1.4-1.6 2.7";
    case "profile":
      return "M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-7 8a7 7 0 0 1 14 0";
    case "search":
      return "m20 20-3.6-3.6M10.8 17a6.2 6.2 0 1 1 0-12.4 6.2 6.2 0 0 1 0 12.4Z";
    default:
      return "M4 12h16";
  }
}

function AdminIcon({ name, className = "h-[18px] w-[18px]" }: { name: AdminIconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={iconPath(name)} />
    </svg>
  );
}

function NavBadge({
  badge,
  collapsed,
}: {
  badge?: { tone: "default" | "warning" | "danger"; value: string };
  collapsed?: boolean;
}) {
  if (!badge) return null;
  if (collapsed) {
    return <span className={["h-2.5 w-2.5 rounded-full border", toneClass(badge.tone)].join(" ")} />;
  }
  return (
    <span className={["inline-flex min-w-6 items-center justify-center rounded-full border px-1.5 py-0.5 text-[11px] font-semibold", toneClass(badge.tone)].join(" ")}>
      {badge.value}
    </span>
  );
}

function NavRow({
  item,
  pathname,
  collapsed,
  badge,
  onNavigate,
}: {
  item: AdminNavItem;
  pathname: string;
  collapsed: boolean;
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
        collapsed ? "justify-center px-0" : "",
        active
          ? "border-cyan-300/28 bg-[linear-gradient(135deg,rgba(79,213,203,0.14),rgba(111,167,255,0.12))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          : "border-transparent bg-transparent text-white/68 hover:border-white/10 hover:bg-white/[0.04] hover:text-white",
      ].join(" ")}
      title={collapsed ? item.label : undefined}
    >
      {active ? <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-cyan-300/90" /> : null}
      <span className={["flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border", active ? "border-cyan-300/20 bg-cyan-300/12 text-cyan-100" : "border-white/10 bg-white/[0.04] text-white/72 group-hover:border-white/16 group-hover:text-white"].join(" ")}>
        <AdminIcon name={item.icon} />
      </span>
      {!collapsed ? (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{item.label}</span>
            <span className="mt-0.5 block truncate text-xs text-white/45">{item.description}</span>
          </span>
          <NavBadge badge={badge} />
        </>
      ) : (
        <span className="absolute right-2 top-2">
          <NavBadge badge={badge} collapsed />
        </span>
      )}
    </Link>
  );
}

function CommandPalette({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: Array<{ key: string; label: string; hint: string; icon: AdminIconName; onSelect: () => void }>;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes(normalized));
  }, [items, query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/68 p-4 pt-[12vh] backdrop-blur-sm">
      <button type="button" className="absolute inset-0" aria-label="Close command palette" onClick={onClose} />
      <div className="glass-card-strong relative z-10 w-full max-w-2xl rounded-[28px] border border-white/12 p-4">
        <div className="flex items-center gap-3 rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3">
          <AdminIcon name="search" className="h-[18px] w-[18px] text-white/55" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages and actions"
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/40"
          />
          <span className="rounded-lg border border-white/12 bg-white/[0.04] px-2 py-1 text-[11px] text-white/55">Esc</span>
        </div>
        <div className="mt-3 max-h-[55vh] space-y-2 overflow-auto">
          {filtered.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                item.onSelect();
                onClose();
              }}
              className="flex w-full items-center gap-3 rounded-2xl border border-transparent bg-white/[0.02] px-3 py-3 text-left text-white/82 hover:border-white/10 hover:bg-white/[0.05]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/72">
                <AdminIcon name={item.icon} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="mt-0.5 block text-xs text-white/45">{item.hint}</span>
              </span>
            </button>
          ))}
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.03] px-4 py-8 text-center text-sm text-white/52">
              No pages or actions match that search.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function AdminShell(props: AdminShellProps) {
  const {
    email,
    isOwner,
    context,
    children,
    routeBase = "/admin",
    navItems,
    profileHref: profileHrefProp,
    helpHref: helpHrefProp,
    signOutCallbackUrl: signOutCallbackUrlProp,
  } = props;
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const items = useMemo(() => {
    if (navItems?.length) {
      return navItems;
    }
    const baseItems = getAdminNavItems(isOwner);
    if (routeBase === "/admin") return baseItems;
    return baseItems.map((item) => ({
      ...item,
      href: item.href.startsWith("/admin") ? item.href.replace(/^\/admin\b/, routeBase) : item.href,
    }));
  }, [isOwner, navItems, routeBase]);
  const currentItem = useMemo(
    () => items.find((item) => isActive(pathname, item.href)) ?? items[0] ?? null,
    [items, pathname]
  );
  const uploadHref = `${routeBase}/documents?openPicker=1`;
  const createLinkHref = `${routeBase}/documents?createLink=1`;
  const profileHref = profileHrefProp || `${routeBase}/team`;
  const helpHref = helpHrefProp || "/security-disclosure";
  const signOutCallbackUrl = signOutCallbackUrlProp || "/";
  const siteHref = routeBase === "/viewer" ? "/projects/doclinks" : "/";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      } else if (event.key === "Escape") {
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const commandItems = useMemo(
    () => [
      ...items.map((item) => ({
        key: item.key,
        label: item.label,
        hint: item.description,
        icon: item.icon,
        onSelect: () => router.push(item.href),
      })),
      {
        key: "upload",
        label: "Upload documents",
        hint: "Open the upload flow on Documents.",
        icon: "documents" as const,
        onSelect: () => router.push(uploadHref),
      },
      {
        key: "create-link",
        label: "Create protected link",
        hint: "Open the protected-link modal from Documents.",
        icon: "links" as const,
        onSelect: () => router.push(createLinkHref),
      },
    ],
    [createLinkHref, items, router, uploadHref]
  );

  const navByGroup = useMemo(() => {
    const byGroup = new Map<string, AdminNavItem[]>();
    for (const item of items) {
      const current = byGroup.get(item.group) ?? [];
      current.push(item);
      byGroup.set(item.group, current);
    }
    return byGroup;
  }, [items]);

  const navContent = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col">
      <div className={["border-b border-white/10 pb-5", collapsed ? "px-3" : "px-5"].join(" ")}>
        <div className={["flex items-center gap-3 rounded-[24px] border border-white/10 bg-white/[0.03] p-3.5", collapsed ? "justify-center" : ""].join(" ")}>
          <img src="/branding/cyang_primary.svg" alt="cyang.io" className="h-10 w-10 rounded-2xl border border-white/10 bg-[#07131f] p-1.5" />
          {!collapsed ? (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-tight text-white">{context.workspaceName}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-white/55">
                  {context.roleLabel}
                </span>
                <span className="rounded-full border border-cyan-300/18 bg-cyan-300/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-cyan-100">
                  {context.planLabel}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {!collapsed ? (
          <div className="mt-4 rounded-[24px] border border-cyan-300/18 bg-[linear-gradient(135deg,rgba(79,213,203,0.13),rgba(111,167,255,0.1))] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-cyan-100/80">Secure sharing workflow</div>
            <div className="mt-2 text-sm font-medium text-white">Upload, scan, protect, and monitor from one place.</div>
            <div className="mt-3 flex gap-2">
              <Link
                href={uploadHref}
                onClick={onNavigate}
                className="btn-base inline-flex rounded-xl border border-cyan-300/35 bg-cyan-300 px-3 py-2 text-xs font-semibold text-[#07131f] hover:bg-cyan-200"
              >
                Upload
              </Link>
              <Link
                href={createLinkHref}
                onClick={onNavigate}
                className="btn-base inline-flex rounded-xl border border-white/12 bg-white/[0.08] px-3 py-2 text-xs text-white/82 hover:bg-white/[0.12]"
              >
                Create Link
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      <div className={["flex-1 space-y-4 overflow-auto py-4", collapsed ? "px-2" : "px-3"].join(" ")}>
        {ADMIN_NAV_GROUPS.map((group) => {
          const groupItems = navByGroup.get(group.key) ?? [];
          if (groupItems.length === 0) return null;
          if (!group.collapsible) {
            return (
              <div key={group.key} className="space-y-2">
                {groupItems.map((item) => (
                  <NavRow
                    key={item.key}
                    item={item}
                    pathname={pathname}
                    collapsed={collapsed}
                    badge={context.badges[item.key as keyof typeof context.badges]}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            );
          }

          const forceOpen = groupItems.some((item) => isActive(pathname, item.href));
          return (
            <details
              key={group.key}
              open={forceOpen}
              className="rounded-[24px] border border-white/10 bg-white/[0.02] p-2"
            >
              <summary className={["cursor-pointer list-none px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42", collapsed ? "text-center" : ""].join(" ")}>
                {collapsed ? group.label.slice(0, 3) : group.label}
              </summary>
              <div className="mt-2 space-y-2">
                {groupItems.map((item) => (
                  <NavRow
                    key={item.key}
                    item={item}
                    pathname={pathname}
                    collapsed={collapsed}
                    badge={context.badges[item.key as keyof typeof context.badges]}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </details>
          );
        })}
      </div>

      <div className={["border-t border-white/10 pt-4", collapsed ? "px-2" : "px-4"].join(" ")}>
        {!collapsed ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left text-sm text-white/76 hover:bg-white/[0.06] hover:text-white"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                <AdminIcon name="search" />
              </span>
              <span className="flex-1">Search and jump</span>
              <span className="rounded-lg border border-white/12 bg-white/[0.04] px-2 py-1 text-[11px] text-white/45">Ctrl K</span>
            </button>
            <Link href={profileHref} onClick={onNavigate} className="flex items-center gap-3 rounded-2xl border border-transparent px-3 py-2 text-sm text-white/64 hover:border-white/10 hover:bg-white/[0.04] hover:text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                <AdminIcon name="profile" />
              </span>
              <span className="flex-1">My Profile</span>
            </Link>
            <Link href={helpHref} onClick={onNavigate} className="flex items-center gap-3 rounded-2xl border border-transparent px-3 py-2 text-sm text-white/64 hover:border-white/10 hover:bg-white/[0.04] hover:text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                <AdminIcon name="help" />
              </span>
              <span className="flex-1">Help & Runbooks</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            <button type="button" onClick={() => setPaletteOpen(true)} className="flex w-full justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-white/72 hover:bg-white/[0.08]">
              <AdminIcon name="search" />
            </button>
            <Link href={profileHref} onClick={onNavigate} className="flex justify-center rounded-2xl border border-transparent px-3 py-2.5 text-white/68 hover:border-white/10 hover:bg-white/[0.04] hover:text-white">
              <AdminIcon name="profile" />
            </Link>
          </div>
        )}

        <div className={["mt-3 rounded-[24px] border border-white/10 bg-white/[0.03]", collapsed ? "p-2" : "p-3.5"].join(" ")}>
          {!collapsed ? (
            <>
              <div className="text-[11px] uppercase tracking-[0.16em] text-white/38">Signed in</div>
              <div className="mt-2 truncate text-sm font-medium text-white/84">{email || "unknown"}</div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => signOut({ callbackUrl: signOutCallbackUrl })}
                  className="btn-base flex-1 rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2 text-xs text-white/84 hover:bg-white/[0.1]"
                >
                  Sign out
                </button>
                <Link href={siteHref} className="btn-base rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-xs text-white/68 hover:bg-white/[0.08]">
                  Site
                </Link>
              </div>
            </>
          ) : (
            <button
              onClick={() => signOut({ callbackUrl: signOutCallbackUrl })}
              className="flex w-full justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-white/76 hover:bg-white/[0.08]"
              aria-label="Sign out"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
                <path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4" />
                <path d="m16 17 5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="app-shell min-h-screen">
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={commandItems} />

      <div className="mx-auto flex w-full max-w-[2200px] gap-4 px-3 py-4 sm:px-4 lg:gap-6 lg:px-6 xl:px-8">
        <aside
          className={[
            "glass-card-strong hidden shrink-0 rounded-[32px] border-white/12 p-3 md:flex md:flex-col",
            collapsed ? "w-[92px]" : "w-[310px]",
          ].join(" ")}
        >
          {navContent()}
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className={["mt-3 flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] py-2.5 text-xs text-white/58 hover:bg-white/[0.06] hover:text-white", collapsed ? "px-0" : "gap-2 px-3"].join(" ")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <path d={collapsed ? "m9 18 6-6-6-6" : "m15 18-6-6 6-6"} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {!collapsed ? "Collapse" : null}
          </button>
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
                    <span>{context.workspaceLabel}</span>
                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/55">
                      {context.roleLabel}
                    </span>
                    <span className="rounded-full border border-cyan-300/18 bg-cyan-300/10 px-2 py-0.5 text-[10px] text-cyan-100">
                      {context.planLabel}
                    </span>
                  </div>
                  <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight text-white">
                    {currentItem?.label || "Workspace"}
                  </h1>
                  <p className="mt-1 max-w-3xl text-sm text-white/58">
                    {currentItem?.description || "Secure document sharing with visible, controlled access."}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPaletteOpen(true)}
                  className="btn-base hidden rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/78 hover:bg-white/[0.08] md:inline-flex"
                >
                  Search
                </button>
                <Link href={createLinkHref} className="btn-base rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/78 hover:bg-white/[0.08]">
                  Create Link
                </Link>
                <Link href={uploadHref} className="btn-base rounded-xl border border-cyan-300/38 bg-cyan-300 px-3.5 py-2 text-sm font-semibold text-[#07131f] hover:bg-cyan-200">
                  Upload Documents
                </Link>
              </div>
            </div>
          </header>

          <main className="pt-5">{children}</main>
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
