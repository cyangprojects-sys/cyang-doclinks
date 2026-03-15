"use client";

import { signOut } from "next-auth/react";

export default function ViewerSignOutButton() {
  return (
    <button
      type="button"
      onClick={() => void signOut({ callbackUrl: "/signin" })}
      className="btn-base rounded-xl border border-white/12 bg-white/[0.05] px-3.5 py-2 text-sm text-white/86 hover:border-white/22 hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
    >
      Sign out
    </button>
  );
}
