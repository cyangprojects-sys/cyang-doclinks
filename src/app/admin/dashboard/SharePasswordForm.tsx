// src/app/admin/dashboard/SharePasswordForm.tsx
"use client";

import { useState } from "react";

export default function SharePasswordForm(props: {
    token: string;
    hasPassword: boolean;
    setAction: (fd: FormData) => Promise<void>;
    clearAction: (fd: FormData) => Promise<void>;
}) {
    const [pw, setPw] = useState("");
    const [busy, setBusy] = useState(false);

    return (
        <div className="inline-flex items-center gap-2 justify-end">
            <form
                action={async (fd) => {
                    setBusy(true);
                    try {
                        await props.setAction(fd);
                        setPw("");
                    } finally {
                        setBusy(false);
                    }
                }}
                className="inline-flex items-center gap-2"
            >
                <input type="hidden" name="token" value={props.token} />
                <input
                    name="password"
                    type="password"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    placeholder={props.hasPassword ? "New password" : "Set password"}
                    className="w-[140px] rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-neutral-600"
                />
                <button
                    type="submit"
                    disabled={busy || pw.trim().length < 4}
                    className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-900 disabled:opacity-50"
                    title="Set / change password"
                >
                    {busy ? "…" : props.hasPassword ? "Change" : "Set"}
                </button>
            </form>

            <form
                action={async (fd) => {
                    setBusy(true);
                    try {
                        await props.clearAction(fd);
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                <input type="hidden" name="token" value={props.token} />
                <button
                    type="submit"
                    disabled={busy || !props.hasPassword}
                    className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-900 disabled:opacity-50"
                    title="Remove password protection"
                >
                    Clear
                </button>
            </form>
        </div>
    );
}
