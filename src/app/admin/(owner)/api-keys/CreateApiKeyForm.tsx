// src/app/admin/(owner)/api-keys/CreateApiKeyForm.tsx
"use client";

import { useState, useTransition } from "react";
import { createApiKeyAction } from "../../actions";

export default function CreateApiKeyForm() {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="block text-sm text-white/75">Key name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. CI deploy bot"
            className="mt-1 w-full rounded-xl border border-white/20 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/45 focus:border-cyan-300/55 focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={() =>
            start(async () => {
              setErr(null);
              setCreatedKey(null);
              try {
                const fd = new FormData();
                fd.set("name", name);
                const res = await createApiKeyAction(fd);
                if (!res?.ok) {
                  setErr("Failed to create key.");
                  return;
                }
                setName("");
                setCreatedKey(res.apiKey || null);
              } catch (e: any) {
                setErr(e?.message || "Failed to create key.");
              }
            })
          }
          disabled={pending || !name.trim()}
          className="btn-base btn-primary rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Creating..." : "Create API key"}
        </button>
      </div>

      {err ? <div className="text-sm text-red-200">{err}</div> : null}

      {createdKey ? (
        <div className="glass-card rounded-xl border-emerald-500/25 p-3">
          <div className="text-sm text-emerald-100">Your new API key (shown once):</div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <code className="break-all rounded-lg bg-black/30 p-2 text-xs text-emerald-50">{createdKey}</code>
            <button
              type="button"
              className="btn-base btn-secondary rounded-lg px-3 py-2 text-xs"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(createdKey);
                } catch {
                  // no-op
                }
              }}
            >
              Copy
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
