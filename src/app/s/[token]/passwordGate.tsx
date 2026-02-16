// src/app/s/[token]/passwordGate.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { verifySharePasswordAction } from "./actions";

export default function PasswordGate(props: { token: string }) {
    const [pw, setPw] = useState("");
    const [err, setErr] = useState<string | null>(null);
    const [busy, startTransition] = useTransition();
    const router = useRouter();

    return (
        <div className="rounded-xl border border-neutral-800 bg-black/20 p-4">
            <div className="text-sm font-medium text-neutral-200">Enter password</div>
            <div className="mt-1 text-xs text-neutral-500">
                You will stay unlocked for 8 hours on this device.
            </div>

            {err ? (
                <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    {err}
                </div>
            ) : null}

            <div className="mt-4 flex gap-2">
                <input
                    type="password"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    placeholder="Password"
                    className="flex-1 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-neutral-600"
                />
                <button
                    disabled={busy || !pw}
                    onClick={() => {
                        setErr(null);
                        startTransition(async () => {
                            const fd = new FormData();
                            fd.set("token", props.token);
                            fd.set("password", pw);
                            const res = await verifySharePasswordAction(fd);
                            if (!res.ok) {
                                setErr(res.message);
                                return;
                            }
                            setPw("");
                            router.refresh();
                        });
                    }}
                    className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-100 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {busy ? "Checking…" : "Unlock"}
                </button>
            </div>

            <div className="mt-2 text-[11px] text-neutral-500">
                Too many attempts will temporarily block you (10/min).
            </div>
        </div>
    );
}
