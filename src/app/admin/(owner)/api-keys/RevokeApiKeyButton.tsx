"use client";

// src/app/admin/api-keys/RevokeApiKeyButton.tsx
import { useTransition } from "react";
import { revokeApiKeyAction } from "../../actions";

export default function RevokeApiKeyButton({ id }: { id: string }) {
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const ok = window.confirm("Revoke this API key? This cannot be undone.");
          if (!ok) return;
          const fd = new FormData();
          fd.set("id", id);
          await revokeApiKeyAction(fd);
        })
      }
      className="rounded-lg border border-red-900/40 bg-red-950/30 px-3 py-2 text-xs text-red-200 hover:bg-red-950/50 disabled:opacity-50"
    >
      {pending ? "Revoking..." : "Revoke"}
    </button>
  );
}
