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
          <label htmlFor="api-key-name" className="block text-sm text-[var(--text-secondary)]">Key name</label>
          <input
            id="api-key-name"
            aria-label="API key name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. CI deploy bot"
            className="field-input mt-1 w-full rounded-sm px-3 py-2 text-sm"
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
              } catch {
                setErr("Failed to create key.");
              }
            })
          }
          disabled={pending || !name.trim()}
          className="btn-base btn-primary rounded-sm px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Creating..." : "Create API key"}
        </button>
      </div>

      {err ? <div className="text-sm text-[var(--danger)]">{err}</div> : null}

      {createdKey ? (
        <div className="rounded-sm border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-sm text-emerald-800">Your new API key (shown once):</div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <code className="break-all rounded-sm border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-900">{createdKey}</code>
            <button
              type="button"
              className="btn-base btn-secondary rounded-sm px-3 py-2 text-xs"
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
