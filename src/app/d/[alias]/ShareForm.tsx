// src/app/d/[alias]/ShareForm.tsx
"use client";

import { useMemo, useState } from "react";
import { createAndEmailShareToken, getShareStatsByToken } from "./actions";

function fmtIso(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ShareForm({ alias }: { alias: string }) {
  const [toEmail, setToEmail] = useState("");
  const [expiresHours, setExpiresHours] = useState<number>(72);
  const [maxViews, setMaxViews] = useState<number>(3);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | null
    | {
      share_url: string;
      token: string;
      expires_at: string | null;
      max_views: number | null;
      view_count: number;
    }
  >(null);

  const [error, setError] = useState<string | null>(null);

  const expiresLabel = useMemo(() => {
    if (!expiresHours || expiresHours <= 0) return "No expiration";
    const d = new Date(Date.now() + expiresHours * 3600 * 1000);
    return fmtIso(d.toISOString());
  }, [expiresHours]);

  async function onSend() {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const res = await createAndEmailShareToken({
        alias,
        to_email: toEmail,
        expires_hours: expiresHours <= 0 ? 0 : expiresHours,
        max_views: maxViews <= 0 ? 0 : maxViews,
      });

      if (!res.ok) {
        setError(res.message || res.error);
        return;
      }

      setResult({
        share_url: res.share_url,
        token: res.token,
        expires_at: res.expires_at,
        max_views: res.max_views,
        view_count: res.view_count,
      });
    } finally {
      setBusy(false);
    }
  }

  async function onRefreshStats() {
    if (!result?.token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await getShareStatsByToken(result.token);
      if (!res.ok) {
        setError(res.message || res.error);
        return;
      }
      setResult((prev) =>
        prev
          ? {
            ...prev,
            view_count: res.view_count,
            max_views: res.max_views,
            expires_at: res.expires_at,
          }
          : prev
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!result?.share_url) return;
    await navigator.clipboard.writeText(result.share_url);
  }

  return (
    <div style={{ border: "1px solid #E6E8EC", borderRadius: 16, padding: 16, background: "#FFFFFF" }}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>Share via secure token email</div>

      <div style={{ display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, color: "#6B7280" }}>Recipient email</div>
          <input
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            placeholder="name@company.com"
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #D1D5DB",
              outline: "none",
              fontSize: 14,
            }}
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#6B7280" }}>Expiration (hours)</div>
            <input
              type="number"
              min={0}
              value={expiresHours}
              onChange={(e) => setExpiresHours(Number(e.target.value))}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #D1D5DB",
                outline: "none",
                fontSize: 14,
              }}
            />
            <div style={{ fontSize: 12, color: "#9CA3AF" }}>Email will show: {expiresLabel}</div>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#6B7280" }}>Max views</div>
            <input
              type="number"
              min={0}
              value={maxViews}
              onChange={(e) => setMaxViews(Number(e.target.value))}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #D1D5DB",
                outline: "none",
                fontSize: 14,
              }}
            />
            <div style={{ fontSize: 12, color: "#9CA3AF" }}>0 = “Unlimited” (if you want that)</div>
          </label>
        </div>

        <button
          onClick={onSend}
          disabled={busy}
          style={{
            borderRadius: 12,
            padding: "10px 12px",
            border: "1px solid #0B2A4A",
            background: busy ? "#0B2A4A" : "#0B2A4A",
            color: "#fff",
            fontWeight: 800,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Sending…" : "Send share email"}
        </button>

        {error ? (
          <div style={{ color: "#B91C1C", fontSize: 13, lineHeight: "18px" }}>{error}</div>
        ) : null}

        {result ? (
          <div style={{ marginTop: 6, padding: 12, borderRadius: 12, background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Share created</div>

            <div style={{ display: "grid", gap: 6, fontSize: 13, color: "#374151" }}>
              <div>
                <span style={{ color: "#6B7280" }}>Link:</span>{" "}
                <a href={result.share_url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                  {result.share_url}
                </a>{" "}
                <button
                  onClick={copyLink}
                  style={{
                    marginLeft: 8,
                    padding: "4px 8px",
                    borderRadius: 10,
                    border: "1px solid #D1D5DB",
                    background: "#fff",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Copy
                </button>
              </div>

              <div>
                <span style={{ color: "#6B7280" }}>Expires:</span> {result.expires_at ? fmtIso(result.expires_at) : "No expiration"}
              </div>

              <div>
                <span style={{ color: "#6B7280" }}>Views:</span> {result.view_count}
                {result.max_views ? ` / ${result.max_views}` : ""}
                <button
                  onClick={onRefreshStats}
                  disabled={busy}
                  style={{
                    marginLeft: 10,
                    padding: "4px 8px",
                    borderRadius: 10,
                    border: "1px solid #D1D5DB",
                    background: "#fff",
                    cursor: busy ? "not-allowed" : "pointer",
                    fontWeight: 700,
                  }}
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
