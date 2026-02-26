// src/app/admin/(owner)/api-keys/RevokeApiKeyButton.tsx
"use client";

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
      className="btn-base btn-danger rounded-lg px-3 py-2 text-xs disabled:opacity-50"
    >
      {pending ? "Revoking..." : "Revoke"}
    </button>
  );
}
