"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function AuthModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [slug, setSlug] = useState("");

  if (!open) return null;

  function handleSSO() {
    if (!slug.trim()) return;
    window.location.href = `/org/${slug.trim().toLowerCase()}/login`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white/5 p-8 ring-1 ring-white/10">
        <h2 className="text-xl font-semibold text-white">Sign In</h2>

        <button
          onClick={() => signIn("google")}
          className="mt-6 w-full rounded-2xl bg-white px-5 py-3 text-sm font-medium text-black hover:bg-white/90"
        >
          Sign in with Google
        </button>

        <div className="mt-6">
          <label className="text-xs text-white/60">
            Organization Slug (for SSO)
          </label>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="e.g. acme"
            className="mt-2 w-full rounded-xl bg-white/10 px-4 py-2 text-sm text-white placeholder-white/40 outline-none ring-1 ring-white/10 focus:ring-white/30"
          />

          <button
            onClick={handleSSO}
            className="mt-3 w-full rounded-2xl bg-white/10 px-5 py-3 text-sm font-medium text-white hover:bg-white/15"
          >
            Sign in with Enterprise SSO
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-6 text-xs text-white/50 hover:text-white"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
