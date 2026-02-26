// src/app/admin/dashboard/RevokeShareForm.tsx
"use client";

import { useState } from "react";

export default function RevokeShareForm(props: {
  token: string;
  revoked: boolean;
  action: (formData: FormData) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <form
      action={async (fd) => {
        if (props.revoked) return;
        setBusy(true);
        try {
          await props.action(fd);
        } finally {
          setBusy(false);
        }
      }}
      className="inline-flex"
    >
      <input type="hidden" name="token" value={props.token} />
      <button
        type="submit"
        disabled={props.revoked || busy}
        className="btn-base btn-danger rounded-lg px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        title={props.revoked ? "Already revoked" : "Revoke this share"}
      >
        {props.revoked ? "Revoked" : busy ? "Revoking..." : "Revoke"}
      </button>
    </form>
  );
}

