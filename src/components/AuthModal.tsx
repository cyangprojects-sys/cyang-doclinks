"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";

export default function AuthModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [slug, setSlug] = useState("");
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const slugInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    slugInputRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;

      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  function handleSSO() {
    if (!slug.trim()) return;
    window.location.href = `/org/${slug.trim().toLowerCase()}/login`;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      aria-hidden={!open}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-3xl bg-white/5 p-8 ring-1 ring-white/10"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
      >
        <h2 id="auth-modal-title" className="text-xl font-semibold text-white">Sign In</h2>

        <button
          onClick={() => signIn("google")}
          className="mt-6 w-full rounded-2xl bg-white px-5 py-3 text-sm font-medium text-black hover:bg-white/90"
        >
          Continue with Google
        </button>

        <div className="mt-6">
          <label htmlFor="auth-org-slug" className="text-xs text-white/60">
            Organization slug (SSO)
          </label>
          <input
            id="auth-org-slug"
            ref={slugInputRef}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            aria-label="Organization slug"
            placeholder="e.g. acme"
            className="mt-2 w-full rounded-xl bg-white/10 px-4 py-2 text-sm text-white placeholder-white/40 outline-none ring-1 ring-white/10 focus:ring-white/30"
          />

          <button
            onClick={handleSSO}
            className="mt-3 w-full rounded-2xl bg-white/10 px-5 py-3 text-sm font-medium text-white hover:bg-white/15"
          >
            Continue with Enterprise SSO
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
