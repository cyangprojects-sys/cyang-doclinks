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
  if (tone === "danger") return "border-[rgba(186,71,50,0.18)] bg-[rgba(186,71,50,0.08)] text-[var(--danger)]";
  if (tone === "warning") return "border-[rgba(161,109,27,0.18)] bg-[rgba(161,109,27,0.08)] text-[var(--accent-warm)]";
  return "border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--text-secondary)]";
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
        "group relative flex items-center gap-3 rounded-sm border px-3 py-3 transition",
        collapsed ? "justify-center px-0" : "",
        active
          ? "border-[var(--border-accent)] bg-[var(--surface-selected)] text-[var(--accent-primary)] shadow-[var(--shadow-soft)]"
          : "border-transparent bg-transparent text-[var(--text-secondary)] hover:border-[var(--border-subtle)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]",
      ].join(" ")}
      title={collapsed ? item.label : undefined}
    >
      {active ? <span className="absolute inset-y-3 left-0 w-1 rounded-r-sm bg-[var(--accent-primary)]" /> : null}
      <span className={["flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border", active ? "border-[var(--border-accent)] bg-[var(--surface-selected)] text-[var(--accent-primary)]" : "border-[var(--border-subtle)] bg-white text-[var(--text-secondary)] group-hover:border-[var(--border-strong)] group-hover:text-[var(--text-primary)]"].join(" ")}>
        <AdminIcon name={item.icon} />
      </span>
      {!collapsed ? (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{item.label}</span>
            <span className="mt-0.5 block truncate text-xs text-[var(--text-faint)]">{item.description}</span>
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
      <div className="surface-panel-strong relative z-10 w-full max-w-2xl p-4">
        <div className="flex items-center gap-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3">
          <AdminIcon name="search" className="h-[18px] w-[18px] text-[var(--text-faint)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages and actions"
            className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
          />
          <span className="rounded-sm border border-[var(--border-subtle)] bg-white px-2 py-1 text-[11px] text-[var(--text-faint)]">Esc</span>
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
              className="flex w-full items-center gap-3 rounded-sm border border-transparent bg-white px-3 py-3 text-left text-[var(--text-secondary)] hover:border-[var(--border-subtle)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--text-secondary)]">
                <AdminIcon name={item.icon} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="mt-0.5 block text-xs text-[var(--text-faint)]">{item.hint}</span>
              </span>
            </button>
          ))}
          {filtered.length === 0 ? (
            <div className="rounded-sm border border-dashed border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
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
      <div className={["border-b border-[var(--border-subtle)] pb-5", collapsed ? "px-3" : "px-5"].join(" ")}>
        <div className={["flex items-center gap-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3.5", collapsed ? "justify-center" : ""].join(" ")}>
          <img src="/branding/cyang_primary.svg" alt="cyang.io" className="h-10 w-10 rounded-sm border border-[var(--border-subtle)] bg-white p-1.5 shadow-[var(--shadow-soft)]" />
          {!collapsed ? (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-tight text-slate-950">{context.workspaceName}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="selection-pill px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                  {context.roleLabel}
                </span>
                <span className="selection-pill-active px-2 py-0.5 text-[11px] uppercase tracking-[0.14em]">
                  {context.planLabel}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {!collapsed ? (
          <div className="mt-4 rounded-sm border border-[var(--border-accent)] bg-[linear-gradient(135deg,rgba(217,233,252,0.85),rgba(255,255,255,0.96))] p-4 shadow-[var(--shadow-soft)]">
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--accent-primary)]">Secure sharing workflow</div>
            <div className="mt-2 text-sm font-medium text-slate-950">Upload, scan, protect, and monitor from one place.</div>
            <div className="mt-3 flex gap-2">
              <Link
                href={uploadHref}
                onClick={onNavigate}
                className="btn-base btn-primary inline-flex px-3 py-2 text-xs font-semibold"
              >
                Upload
              </Link>
              <Link
                href={createLinkHref}
                onClick={onNavigate}
                className="btn-base btn-secondary inline-flex px-3 py-2 text-xs"
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
              className="rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-2"
            >
              <summary className={["cursor-pointer list-none px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]", collapsed ? "text-center" : ""].join(" ")}>
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

      <div className={["border-t border-[var(--border-subtle)] pt-4", collapsed ? "px-2" : "px-4"].join(" ")}>
        {!collapsed ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex w-full items-center gap-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2.5 text-left text-sm text-[var(--text-secondary)] hover:bg-white hover:text-[var(--text-primary)]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-sm border border-[var(--border-subtle)] bg-white">
                <AdminIcon name="search" />
              </span>
              <span className="flex-1">Search and jump</span>
              <span className="rounded-sm border border-[var(--border-subtle)] bg-white px-2 py-1 text-[11px] text-[var(--text-faint)]">Ctrl K</span>
            </button>
            <Link href={profileHref} onClick={onNavigate} className="flex items-center gap-3 rounded-sm border border-transparent px-3 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--border-subtle)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]">
              <span className="flex h-9 w-9 items-center justify-center rounded-sm border border-[var(--border-subtle)] bg-white">
                <AdminIcon name="profile" />
              </span>
              <span className="flex-1">My Profile</span>
            </Link>
            <Link href={helpHref} onClick={onNavigate} className="flex items-center gap-3 rounded-sm border border-transparent px-3 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--border-subtle)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]">
              <span className="flex h-9 w-9 items-center justify-center rounded-sm border border-[var(--border-subtle)] bg-white">
                <AdminIcon name="help" />
              </span>
              <span className="flex-1">Help & Runbooks</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            <button type="button" onClick={() => setPaletteOpen(true)} className="flex w-full justify-center rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2.5 text-[var(--text-secondary)] hover:bg-white">
              <AdminIcon name="search" />
            </button>
            <Link href={profileHref} onClick={onNavigate} className="flex justify-center rounded-sm border border-transparent px-3 py-2.5 text-[var(--text-secondary)] hover:border-[var(--border-subtle)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]">
              <AdminIcon name="profile" />
            </Link>
          </div>
        )}

        <div className={["mt-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-soft)]", collapsed ? "p-2" : "p-3.5"].join(" ")}>
          {!collapsed ? (
            <>
              <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-faint)]">Signed in</div>
              <div className="mt-2 truncate text-sm font-medium text-slate-950">{email || "unknown"}</div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => signOut({ callbackUrl: signOutCallbackUrl })}
                  className="btn-base btn-secondary flex-1 px-3 py-2 text-xs"
                >
                  Sign out
                </button>
                <Link href={siteHref} className="btn-base btn-ghost px-3 py-2 text-xs">
                  Site
                </Link>
              </div>
            </>
          ) : (
            <button
              onClick={() => signOut({ callbackUrl: signOutCallbackUrl })}
              className="flex w-full justify-center rounded-sm border border-[var(--border-subtle)] bg-white px-3 py-2.5 text-[var(--text-secondary)] hover:bg-[var(--surface-soft)]"
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
            "surface-panel-strong hidden shrink-0 p-3 md:flex md:flex-col",
            collapsed ? "w-[92px]" : "w-[310px]",
          ].join(" ")}
        >
          {navContent()}
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className={["mt-3 flex items-center justify-center rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-soft)] py-2.5 text-xs text-[var(--text-faint)] hover:bg-white hover:text-[var(--text-primary)]", collapsed ? "px-0" : "gap-2 px-3"].join(" ")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <path d={collapsed ? "m9 18 6-6-6-6" : "m15 18-6-6 6-6"} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {!collapsed ? "Collapse" : null}
          </button>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="surface-panel-strong sticky top-2 z-40 px-4 py-4 md:px-6">
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
                  <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
                    <span>{context.workspaceLabel}</span>
                    <span className="selection-pill px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
                      {context.roleLabel}
                    </span>
                    <span className="selection-pill-active px-2 py-0.5 text-[10px]">
                      {context.planLabel}
                    </span>
                  </div>
                  <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight text-slate-950">
                    {currentItem?.label || "Workspace"}
                  </h1>
                  <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
                    {currentItem?.description || "Secure document sharing with visible, controlled access."}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPaletteOpen(true)}
                  className="btn-base btn-secondary hidden px-3 py-2 text-sm md:inline-flex"
                >
                  Search
                </button>
                <Link href={createLinkHref} className="btn-base btn-secondary px-3 py-2 text-sm">
                  Create Link
                </Link>
                <Link href={uploadHref} className="btn-base btn-primary px-3.5 py-2 text-sm font-semibold">
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
          <div className="surface-panel-strong absolute inset-y-2 left-2 w-[88%] max-w-sm p-3">
            {navContent(() => setMobileOpen(false))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
