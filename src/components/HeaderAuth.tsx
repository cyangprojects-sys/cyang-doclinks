"use client";

import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import AuthModal from "./AuthModal";

export default function HeaderAuth() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div>
        {session ? (
          <button
            onClick={() => signOut()}
            className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
          >
            Sign Out
          </button>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90"
          >
            Sign In
          </button>
        )}
      </div>

      <AuthModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
