"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createAndEmailShareToken } from "@/app/d/[alias]/actions";

type DocOption = {
  docId: string;
  title: string;
};

type LinkPreset = "public" | "password" | "email" | "one_time";

const PRESET_OPTIONS: Array<{ id: LinkPreset; label: string; description: string }> = [
  { id: "public", label: "Public", description: "Open link with your default protections." },
  { id: "password", label: "Password", description: "Require a password before opening the file." },
  { id: "email", label: "Email-only", description: "Restrict access to one recipient email." },
  { id: "one_time", label: "One-time", description: "Allow a single access (Pro preset)." },
];

export default function DashboardHeaderActions(props: { docs: DocOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedDocId, setSelectedDocId] = useState(props.docs[0]?.docId || "");
  const [preset, setPreset] = useState<LinkPreset>("public");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  const filteredDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return props.docs;
    return props.docs.filter((d) => `${d.title} ${d.docId}`.toLowerCase().includes(q));
  }, [props.docs, query]);

  function resetFlow() {
    setErr(null);
    setCreatedUrl(null);
    setPreset("public");
    setRecipientEmail("");
    setPassword("");
  }

  async function onCreateLink() {
    setErr(null);
    if (!selectedDocId) {
      setErr("Pick a document first.");
      return;
    }
    if (preset === "email" && !recipientEmail.trim()) {
      setErr("Enter a recipient email for Email-only links.");
      return;
    }
    if (preset === "password" && !password.trim()) {
      setErr("Enter a password for Password links.");
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("docId", selectedDocId);
      fd.set("packId", preset === "one_time" ? "one_time_share" : "general_secure_link");
      fd.set("toEmail", preset === "email" ? recipientEmail.trim().toLowerCase() : "");
      fd.set("password", preset === "password" ? password : "");
      const res = await createAndEmailShareToken(fd);
      if (!res.ok) {
        setErr(res.message || res.error || "Unable to create link.");
        return;
      }
      const resolvedUrl =
        (typeof res.url === "string" && res.url.trim()) ||
        `${window.location.origin}/s/${encodeURIComponent(String(res.token || ""))}`;
      setCreatedUrl(resolvedUrl);
    } catch {
      setErr("Unable to create link.");
    } finally {
      setBusy(false);
    }
  }

  async function onCopy() {
    if (!createdUrl) return;
    await navigator.clipboard.writeText(createdUrl);
  }

  function onSendEmail() {
    if (!createdUrl) return;
    const to = encodeURIComponent(recipientEmail.trim());
    const subject = encodeURIComponent("Protected document link");
    const body = encodeURIComponent(`Here is your protected link:\n\n${createdUrl}`);
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-base rounded-lg border border-white/20 bg-white/90 px-3 py-2 text-sm font-medium text-black hover:bg-white"
        >
          Create protected link
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/dashboard?tab=uploads&openPicker=1#docs")}
          className="btn-base btn-secondary rounded-lg px-3 py-2 text-sm"
        >
          Upload document
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/15 bg-[#0b1220] p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Create protected link</h3>
                <p className="mt-1 text-xs text-white/60">Choose document, choose preset, create and share.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="btn-base btn-secondary rounded-lg px-2 py-1 text-xs">
                Close
              </button>
            </div>

            {!createdUrl ? (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">Step 1</div>
                  <label className="mt-2 block text-sm text-white/80">Choose document</label>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name..."
                    className="mt-1 w-full rounded-lg border border-white/20 bg-black/25 px-3 py-2 text-sm text-white placeholder:text-white/45"
                  />
                  <select
                    value={selectedDocId}
                    onChange={(e) => setSelectedDocId(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-white/20 bg-black/25 px-3 py-2 text-sm text-white"
                  >
                    {filteredDocs.map((d) => (
                      <option key={d.docId} value={d.docId}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">Step 2</div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {PRESET_OPTIONS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPreset(p.id)}
                        className={`rounded-lg border p-3 text-left text-sm transition ${
                          preset === p.id ? "border-cyan-400/40 bg-cyan-500/10 text-white" : "border-white/15 bg-white/[0.03] text-white/80 hover:bg-white/[0.06]"
                        }`}
                      >
                        <div className="font-medium">{p.label}</div>
                        <div className="mt-1 text-xs text-white/60">{p.description}</div>
                      </button>
                    ))}
                  </div>
                  {preset === "email" ? (
                    <input
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      placeholder="recipient@example.com"
                      className="mt-2 w-full rounded-lg border border-white/20 bg-black/25 px-3 py-2 text-sm text-white placeholder:text-white/45"
                    />
                  ) : null}
                  {preset === "password" ? (
                    <input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Set password"
                      className="mt-2 w-full rounded-lg border border-white/20 bg-black/25 px-3 py-2 text-sm text-white placeholder:text-white/45"
                    />
                  ) : null}
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">Step 3</div>
                  <button
                    type="button"
                    onClick={onCreateLink}
                    disabled={busy}
                    className="mt-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50"
                  >
                    {busy ? "Creating..." : "Create link"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                  Protected link created.
                </div>
                <input readOnly value={createdUrl} className="w-full rounded-lg border border-white/20 bg-black/25 px-3 py-2 text-sm text-white" />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={onCopy} className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-black hover:bg-white/90">
                    Copy link
                  </button>
                  <button type="button" onClick={onSendEmail} className="btn-base btn-secondary rounded-lg px-3 py-2 text-sm">
                    Send email
                  </button>
                  <button type="button" onClick={resetFlow} className="btn-base btn-secondary rounded-lg px-3 py-2 text-sm">
                    Create another
                  </button>
                </div>
              </div>
            )}

            {err ? <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-sm text-rose-200">{err}</div> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
