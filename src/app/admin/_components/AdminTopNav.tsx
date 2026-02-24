"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      className={[
        "inline-flex items-center rounded-md px-3 py-1.5 text-sm transition",
        active ? "bg-white/15 text-white" : "bg-white/5 text-white/80 hover:bg-white/10",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export default function AdminTopNav({
  email,
  isOwner,
}: {
  email?: string | null;
  isOwner: boolean;
}) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/60 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-semibold tracking-tight">
            CYANG.IO
          </Link>

          <nav className="flex items-center gap-2">
            <NavLink href="/admin/dashboard" label="Dashboard" />

            {isOwner && (
              <>
                <NavLink href="/admin/audit" label="Audit" />
                <NavLink href="/admin/webhooks" label="Webhooks" />
                <NavLink href="/admin/api-keys" label="API Keys" />
                <NavLink href="/admin/billing" label="Billing" />
              </>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {email && <div className="text-sm text-white/70">{email}</div>}
          <button
            className="inline-flex items-center rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/90 hover:bg-white/10"
            onClick={() => signOut({ callbackUrl: "/" })}
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
