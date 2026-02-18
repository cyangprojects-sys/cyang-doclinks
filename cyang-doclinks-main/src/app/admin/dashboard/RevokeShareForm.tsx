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
                className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-100 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
                title={props.revoked ? "Already revoked" : "Revoke this share"}
            >
                {props.revoked ? "Revoked" : busy ? "Revoking…" : "Revoke"}
            </button>
        </form>
    );
}
