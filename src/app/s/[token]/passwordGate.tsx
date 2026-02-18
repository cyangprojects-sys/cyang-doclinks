// src/app/s/[token]/passwordGate.tsx
"use client";

import { useState } from "react";
import { verifySharePasswordResultAction } from "./actions";

export default function PasswordGate({ token }: { token: string }) {
    const [pw, setPw] = useState("");
    const [err, setErr] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    return (
        <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
            <div className="text-sm text-neutral-400">
                This share link is password protected.
            </div>

            {err ? (
                <div className="mt-3 rounded-md border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
                    {err}
                </div>
            ) : null}

            <div className="mt-4 space-y-3">
                <input
                    type="password"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    placeholder="Password"
                    className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
                />

                <button
                    disabled={busy}
                    onClick={async () => {
                        setErr(null);
                        setBusy(true);
                        try {
                            const fd = new FormData();
                            fd.set("token", token);
                            fd.set("password", pw);

                            const res = await verifySharePasswordResultAction(fd);
                            if (!res.ok) {
                                setErr(res.message);
                                return;
                            }

                            // Success: client redirect to raw view
                            window.location.href = `/s/${encodeURIComponent(token)}/raw`;
                        } finally {
                            setBusy(false);
                        }
                    }}
                    className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
                >
                    {busy ? "Unlocking…" : "Unlock"}
                </button>
            </div>
        </div>
    );
}
