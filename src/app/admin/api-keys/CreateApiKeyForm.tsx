"use client";

// src/app/admin/api-keys/CreateApiKeyForm.tsx
import { useState, useTransition } from "react";
import { createApiKeyAction } from "../actions";

export default function CreateApiKeyForm() {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="block text-sm text-neutral-300">Key name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. CI deploy bot"
            className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
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
          className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Creating..." : "Create API key"}
        </button>
      </div>

      {err && <div className="text-sm text-red-300">{err}</div>}

      {createdKey && (
        <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/30 p-3">
          <div className="text-sm text-emerald-200">Your new API key (shown once):</div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <code className="break-all rounded-lg bg-black/30 p-2 text-xs text-emerald-100">{createdKey}</code>
            <button
              type="button"
              className="rounded-lg border border-emerald-900/60 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-100 hover:bg-emerald-950/60"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(createdKey);
                } catch { }
              }}
            >
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
