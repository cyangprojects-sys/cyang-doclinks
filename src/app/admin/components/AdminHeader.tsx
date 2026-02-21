"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

export default function AdminHeader() {
  const { data: session } = useSession();
  const pathname = usePathname();

  const role = ((session?.user as any)?.role as string | undefined) ?? "viewer";
  const isOwnerTools = role === "owner" || role === "admin";

  function NavLink({ href, label }: { href: string; label: string }) {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
          active
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        {label}
      </Link>
    );
  }

  return (
    <header className="sticky top-0 z-50 bg-background border-b border-border">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/admin/dashboard" className="font-semibold text-lg">
            CYANG.IO
          </Link>

          <nav className="flex gap-2">
            <NavLink href="/admin/dashboard" label="Dashboard" />
            {isOwnerTools && (
              <>
                <NavLink href="/admin/audit" label="Audit" />
                <NavLink href="/admin/api-keys" label="API Keys" />
                <NavLink href="/admin/webhooks" label="Webhooks" />
              </>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-4 text-sm">
          {session ? (
            <>
              <div className="text-right leading-tight">
                <div className="font-medium">{session.user?.email}</div>
                {isOwnerTools ? (
                  <div className="mt-1 inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    Owner tools
                  </div>
                ) : null}
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="px-3 py-2 rounded-md border border-border text-foreground hover:bg-muted"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/api/auth/signin"
              className="px-3 py-2 rounded-md border border-border text-foreground hover:bg-muted"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
