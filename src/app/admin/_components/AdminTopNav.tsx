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
        "inline-flex items-center rounded-sm border px-3 py-1.5 text-sm transition",
        active
          ? "border-[var(--border-accent)] bg-[var(--surface-selected)] text-[var(--accent-primary)] shadow-[var(--shadow-soft)]"
          : "border-transparent bg-transparent text-[var(--text-secondary)] hover:border-[var(--border-subtle)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]",
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
    <header className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[rgba(255,255,255,0.92)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-[2200px] items-center justify-between px-3 py-3 sm:px-4 lg:px-6 xl:px-8">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-semibold tracking-tight text-slate-950">
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
                <NavLink href="/admin/billing/stripe" label="Stripe" />
                <NavLink href="/admin/security" label="Security" />
                <NavLink href="/admin/viewer-uploads" label="Viewer Uploads" />
                <NavLink href="/admin/abuse" label="Abuse" />
                <NavLink href="/admin/dmca" label="DMCA" />
              </>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {email && <div className="text-sm text-[var(--text-secondary)]">{email}</div>}
          <button
            className="btn-base btn-secondary inline-flex rounded-sm px-3 py-1.5 text-sm"
            onClick={() => signOut({ callbackUrl: "/" })}
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
