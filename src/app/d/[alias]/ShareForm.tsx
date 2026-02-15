"use client";

import { useMemo, useState } from "react";
import { shareDocToEmail } from "./actions";

export default function ShareForm({ docId }: { docId: string }) {
    const [email, setEmail] = useState("");
    const [confirming, setConfirming] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const valid = useMemo(() => {
        const e = email.trim().toLowerCase();
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
    }, [email]);

    async function onSend() {
        setStatus(null);
        if (!valid) {
            setStatus("Enter a valid email address.");
            return;
        }
        setBusy(true);
        try {
            const res = await shareDocToEmail({ docId, email: email.trim().toLowerCase() });
            if (!res.ok) setStatus(res.error ?? "Failed to send.");
            else {
                setStatus(`Sent to ${email.trim()} ✅`);
                setEmail("");
                setConfirming(false);
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <div style={{ display: "grid", gap: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Share</h2>

            <label style={{ fontSize: 12, opacity: 0.8 }}>Recipient email</label>
            <input
                value={email}
                onChange={(e) => {
                    setEmail(e.target.value);
                    setStatus(null);
                    setConfirming(false);
                }}
                placeholder="name@example.com"
                style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.15)",
                    background: "transparent",
                    color: "inherit",
                }}
            />

            {!confirming ? (
                <button
                    disabled={!valid || busy}
                    onClick={() => setConfirming(true)}
                    style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.15)",
                        background: "rgba(255,255,255,0.06)",
                        cursor: !valid || busy ? "not-allowed" : "pointer",
                    }}
                >
                    Share…
                </button>
            ) : (
                <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 13, opacity: 0.9 }}>
                        Send a magic link to <b>{email.trim()}</b>?
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button
                            disabled={busy}
                            onClick={onSend}
                            style={{
                                padding: "10px 12px",
                                borderRadius: 10,
                                border: "1px solid rgba(255,255,255,0.15)",
                                background: "rgba(255,255,255,0.10)",
                                cursor: busy ? "not-allowed" : "pointer",
                                flex: 1,
                            }}
                        >
                            {busy ? "Sending…" : "Confirm & Send"}
                        </button>
                        <button
                            disabled={busy}
                            onClick={() => setConfirming(false)}
                            style={{
                                padding: "10px 12px",
                                borderRadius: 10,
                                border: "1px solid rgba(255,255,255,0.15)",
                                background: "transparent",
                                cursor: busy ? "not-allowed" : "pointer",
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {status ? <div style={{ fontSize: 13, opacity: 0.9 }}>{status}</div> : null}
        </div>
    );
}
