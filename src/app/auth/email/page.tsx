"use client";

import { useState } from "react";

export default function EmailLoginPage() {
  const [email, setEmail] = useState("");
  const [alias, setAlias] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sendLink() {
    setMsg(null);

    const e = email.trim();
    const a = alias.trim();

    if (!e) return setMsg("Enter your email.");
    if (!a) return setMsg("Enter the document alias (e.g., test-doc).");

    setBusy(true);
    try {
      const res = await fetch("/auth/email/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e, alias: a }),
      });

      // show helpful error text if your API returns it
      const ct = res.headers.get("content-type") || "";
      const text = await res.text();

      if (!res.ok) {
        throw new Error(
          ct.includes("application/json")
            ? (() => {
              try {
                return JSON.parse(text)?.error || "Failed to send link.";
              } catch {
                return text || "Failed to send link.";
              }
            })()
            : text || "Failed to send link."
        );
      }

      setMsg("✅ Check your email for the sign-in link.");
    } catch (err: any) {
      setMsg(err?.message || "Failed to send link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-md px-6 py-12 space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="text-sm opacity-70">
            Enter your email and the document alias. We’ll send you a sign-in link.
          </p>
        </header>

        <div className="space-y-2">
          <div className="text-sm opacity-80">Email</div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 outline-none"
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm opacity-80">Document alias</div>
          <input
