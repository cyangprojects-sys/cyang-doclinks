"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

export default function AdminHeader() {
  const { data: session } = useSession();
  const pathname = usePathname();

  // NOTE: role is injected into the session in src/auth.ts (JWT/session callbacks).
  // Keep this resilient in case the type augmentation isn't loaded somewhere.
  const role = (session?.user as any)?.role ?? "viewer";

  function NavLink({ href, label }: { href: string; label: string }) {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={[
          "px-3 py-2 text-sm font-medium rounded-md transition-colors",
          active
            ? "bg-foreground text-background"
            : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground",
        ].join(" ")}
      >
        {label}
      </Link>
    );
  }

  return (
    <header className="sticky top-0 z-50 border-b border-foreground/10 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm font-semibold tracking-wide">
            CYANG.IO
          </Link>

          <nav className="flex items-center gap-1">
            <NavLink href="/admin/dashboard" label="Dashboard" />
            <NavLink href="/admin/audit" label="Audit" />
            <NavLink href="/admin/api-keys" label="API Keys" />
            <NavLink href="/admin/webhooks" label="Webhooks" />
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-right leading-tight">
            <div className="text-xs text-foreground/70">{session?.user?.email ?? ""}</div>
            <div className="text-xs text-foreground/50">role: {role}</div>
          </div>

          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="px-3 py-2 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
