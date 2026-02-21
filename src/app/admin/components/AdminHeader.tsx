
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

export default function AdminHeader() {
  const { data: session } = useSession();
  const pathname = usePathname();

  const role = session?.user?.role ?? "viewer";

  function NavLink({ href, label }: { href: string; label: string }) {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`px-3 py-2 text-sm font-medium rounded-md ${
          active
            ? "bg-black text-white"
            : "text-gray-600 hover:bg-gray-100 hover:text-black"
        }`}
      >
        {label}
      </Link>
    );
  }

  return (
    <header className="sticky top-0 z-50 bg-white border-b">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/admin/dashboard" className="font-semibold text-lg">
            CYANG.IO
          </Link>

          <nav className="flex gap-2">
            <NavLink href="/admin/dashboard" label="Dashboard" />
            {(role === "owner" || role === "admin") && (
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
              <div className="text-right">
                <div className="font-medium">{session.user?.email}</div>
                <div className="text-gray-500">role: {role}</div>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="px-3 py-2 rounded-md border text-gray-700 hover:bg-gray-100"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/api/auth/signin"
              className="px-3 py-2 rounded-md border text-gray-700 hover:bg-gray-100"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
