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
    <div className="inline-flex items-center justify-end gap-2">
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
          className="w-[140px] rounded-lg border border-white/20 bg-black/20 px-2 py-1 text-xs text-white placeholder:text-white/45 focus:border-cyan-300/55 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || pw.trim().length < 4}
          className="btn-base btn-secondary rounded-lg px-2 py-1 text-xs disabled:opacity-50"
          title="Set or change password"
        >
          {busy ? "..." : props.hasPassword ? "Change" : "Set"}
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
          className="btn-base btn-secondary rounded-lg px-2 py-1 text-xs disabled:opacity-50"
          title="Remove password protection"
        >
          Clear
        </button>
      </form>
    </div>
  );
}

