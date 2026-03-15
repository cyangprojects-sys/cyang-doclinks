"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const SHARE_PATH_RE = /^\/(s|d|t)\/[A-Za-z0-9_-]+(?:\/(view|download|raw))?$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{8,160}$/;

function normalizeViewerDestination(rawValue: string): string | null {
  const value = String(rawValue || "").trim();
  if (!value) return null;

  if (value.startsWith("/")) {
    const path = value.split("?")[0];
    if (!SHARE_PATH_RE.test(path)) return null;
    return value;
  }

  if (TOKEN_RE.test(value)) {
    return `/s/${value}`;
  }

  try {
    const url = new URL(value);
    const path = url.pathname || "/";
    if (!SHARE_PATH_RE.test(path)) return null;
    return `${path}${url.search}`;
  } catch {
    return null;
  }
}

export default function ViewerLinkLauncher() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;

    const destination = normalizeViewerDestination(value);
    if (!destination) {
      setError("Paste a valid secure link or token (example: /s/..., /d/..., or full cyang link).");
      return;
    }

    setBusy(true);
    setError(null);
    router.push(destination);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block text-sm text-white/78">
        Shared link or token
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Paste /s/token, /d/alias, or full secure link"
          className="mt-2 w-full rounded-xl border border-white/14 bg-black/20 px-3.5 py-2.5 text-sm text-white placeholder:text-white/42 focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
        />
      </label>
      {error ? <p className="text-xs text-rose-200">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="submit"
          disabled={busy}
          className="btn-base rounded-xl border border-cyan-300/45 bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-[#07131f] shadow-[0_12px_28px_rgba(34,211,238,0.2)] hover:bg-cyan-200 disabled:opacity-65"
        >
          {busy ? "Opening..." : "Open secure content"}
        </button>
        <button
          type="button"
          onClick={() => {
            setValue("");
            setError(null);
          }}
          className="btn-base rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2 text-xs text-white/74 hover:border-white/22 hover:bg-white/[0.1]"
        >
          Clear
        </button>
      </div>
    </form>
  );
}
