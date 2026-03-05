"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createAndEmailShareToken } from "@/app/d/[alias]/actions";
import { isPackAvailableForPlan, type PackId } from "@/lib/packs";
import { getDocumentUiStatus, getShareEligibility } from "@/lib/documentStatus";

type DocOption = {
  docId: string;
  title: string;
  docState?: string | null;
  scanState?: string | null;
  moderationStatus?: string | null;
};

type ModalPresetId =
  | "general_secure"
  | "email_safe"
  | "client_share"
  | "resume_portfolio"
  | "one_time_share"
  | "legal_confidential"
  | "id_verification";

type ModalPreset = {
  id: ModalPresetId;
  label: string;
  description: string;
  packId: PackId;
  minPlan: "free" | "pro";
  overrides?: {
    allowDownload?: boolean;
    watermarkEnabled?: boolean;
    expiresInSeconds?: number;
    maxViews?: number | null;
  };
};

const PRESET_OPTIONS: readonly ModalPreset[] = [
  {
    id: "general_secure",
    label: "General Secure Link",
    description: "Default experience for most shares.",
    packId: "general_secure_link",
    minPlan: "free",
  },
  {
    id: "email_safe",
    label: "Email-safe",
    description: "Light watermark for everyday sharing.",
    packId: "general_secure_link",
    minPlan: "free",
    overrides: { watermarkEnabled: true, allowDownload: true, expiresInSeconds: 14 * 24 * 60 * 60 },
  },
  {
    id: "client_share",
    label: "Client share",
    description: "Download-friendly with a 7-day expiry.",
    packId: "internal_review",
    minPlan: "free",
    overrides: { watermarkEnabled: false, allowDownload: true, expiresInSeconds: 7 * 24 * 60 * 60 },
  },
  {
    id: "resume_portfolio",
    label: "Resume / Portfolio",
    description: "Longer window for resume and portfolio sharing.",
    packId: "job_search",
    minPlan: "free",
  },
  {
    id: "one_time_share",
    label: "One-Time Share",
    description: "Auto-closes after first access.",
    packId: "one_time_share",
    minPlan: "pro",
  },
  {
    id: "legal_confidential",
    label: "Legal / Confidential",
    description: "Stricter sharing and stronger watermark defaults.",
    packId: "legal_confidential",
    minPlan: "pro",
  },
  {
    id: "id_verification",
    label: "ID / Verification",
    description: "Best for paystubs, IDs, and onboarding.",
    packId: "id_verification",
    minPlan: "pro",
  },
];

export default function DashboardHeaderActions(props: { docs: DocOption[]; planId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedDocId, setSelectedDocId] = useState("");
  const [preset, setPreset] = useState<ModalPresetId>("general_secure");
  const [sendToEmail, setSendToEmail] = useState("");
  const [proUpsellPreset, setProUpsellPreset] = useState<ModalPresetId | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [shareWarning, setShareWarning] = useState<string | null>(null);

  const docsWithStatus = useMemo(() => {
    return props.docs.map((d) => {
      const ui = getDocumentUiStatus({
        docStateRaw: d.docState,
        scanStateRaw: d.scanState,
        moderationStatusRaw: d.moderationStatus,
      });
      const eligibility = getShareEligibility({
        docStateRaw: d.docState,
        scanStateRaw: d.scanState,
        moderationStatusRaw: d.moderationStatus,
      });
      return { ...d, ui, eligibility };
    });
  }, [props.docs]);

  useEffect(() => {
    if (!docsWithStatus.length) {
      setSelectedDocId("");
      setShareWarning(null);
      return;
    }
    if (selectedDocId && docsWithStatus.some((d) => d.docId === selectedDocId)) {
      const current = docsWithStatus.find((d) => d.docId === selectedDocId);
      setShareWarning(current?.eligibility.warning ?? null);
      return;
    }
    const firstEligible = docsWithStatus.find((d) => d.eligibility.canCreateLink);
    setSelectedDocId(firstEligible?.docId || docsWithStatus[0].docId);
    setShareWarning(firstEligible?.eligibility.warning ?? null);
  }, [docsWithStatus, selectedDocId]);

  const filteredDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docsWithStatus;
    return docsWithStatus.filter((d) => `${d.title} ${d.docId}`.toLowerCase().includes(q));
  }, [docsWithStatus, query]);

  function resetFlow() {
    setErr(null);
    setCreatedUrl(null);
    setPreset("general_secure");
    setSendToEmail("");
    setProUpsellPreset(null);
    const current = docsWithStatus.find((d) => d.docId === selectedDocId);
    setShareWarning(current?.eligibility.warning ?? null);
  }

  async function onCreateLink() {
    setErr(null);
    if (!selectedDocId) {
      setErr("Pick a document first.");
      return;
    }
    const selectedDoc = docsWithStatus.find((d) => d.docId === selectedDocId);
    if (!selectedDoc) {
      setErr("Document not found.");
      return;
    }
    if (!selectedDoc.eligibility.canCreateLink) {
      setErr(selectedDoc.eligibility.blockedReason || "This file cannot be shared yet.");
      return;
    }
    const selectedPreset = PRESET_OPTIONS.find((p) => p.id === preset);
    if (!selectedPreset) {
      setErr("Pick a preset first.");
      return;
    }
    if (!isPackAvailableForPlan(selectedPreset.packId, props.planId)) {
      setErr("Pro preset selected. Upgrade to enable.");
      setProUpsellPreset(selectedPreset.id);
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("docId", selectedDocId);
      fd.set("packId", selectedPreset.packId);
      if (selectedPreset.overrides?.allowDownload !== undefined) {
        fd.set("overrideAllowDownload", selectedPreset.overrides.allowDownload ? "1" : "0");
      }
      if (selectedPreset.overrides?.watermarkEnabled !== undefined) {
        fd.set("overrideWatermarkEnabled", selectedPreset.overrides.watermarkEnabled ? "1" : "0");
      }
      if (selectedPreset.overrides?.maxViews !== undefined) {
        fd.set("overrideMaxViews", selectedPreset.overrides.maxViews == null ? "" : String(selectedPreset.overrides.maxViews));
      }
      if (selectedPreset.overrides?.expiresInSeconds !== undefined) {
        const iso = new Date(Date.now() + selectedPreset.overrides.expiresInSeconds * 1000).toISOString();
        fd.set("overrideExpiresAt", iso);
      }
      const res = await createAndEmailShareToken(fd);
      if (!res.ok) {
        setErr(res.message || res.error || "Unable to create link.");
        if (res.error === "PACK_REQUIRES_PRO") {
          setProUpsellPreset(selectedPreset.id);
        }
        return;
      }
      const resolvedUrl =
        (typeof res.url === "string" && res.url.trim()) ||
        `${window.location.origin}/s/${encodeURIComponent(String(res.token || ""))}`;
      setCreatedUrl(resolvedUrl);
      setProUpsellPreset(null);
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
    const to = encodeURIComponent(sendToEmail.trim());
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
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSelectedDocId(nextId);
                      const doc = docsWithStatus.find((d) => d.docId === nextId);
                      setShareWarning(doc?.eligibility.warning ?? null);
                    }}
                    className="mt-2 w-full rounded-lg border border-white/20 bg-black/25 px-3 py-2 text-sm text-white"
                  >
                    {filteredDocs.map((d) => (
                      <option key={d.docId} value={d.docId} disabled={!d.eligibility.canCreateLink} title={d.ui.subtext}>
                        {`${d.title} - ${d.ui.label}${d.eligibility.canCreateLink ? "" : " (Unavailable)"}`}
                      </option>
                    ))}
                  </select>
                  {shareWarning ? (
                    <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
                      {shareWarning}
                    </div>
                  ) : null}
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">Step 2</div>
                  <div className="mt-1 text-xs text-white/60">Preset controls expiration, watermarking, and viewing rules.</div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {PRESET_OPTIONS.map((p) => (
                      (() => {
                        const locked = !isPackAvailableForPlan(p.packId, props.planId);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              if (locked) {
                                setProUpsellPreset(p.id);
                                return;
                              }
                              setProUpsellPreset(null);
                              setPreset(p.id);
                            }}
                            className={`rounded-lg border p-3 text-left text-sm transition ${
                              preset === p.id
                                ? "border-cyan-400/40 bg-cyan-500/10 text-white"
                                : locked
                                  ? "border-white/10 bg-white/[0.02] text-white/45"
                                  : "border-white/15 bg-white/[0.03] text-white/80 hover:bg-white/[0.06]"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div className="font-medium">{p.label}</div>
                              {locked ? (
                                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
                                  Locked
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 text-xs text-white/60">{p.description}</div>
                          </button>
                        );
                      })()
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-white/60">
                    Unlock Pro presets: one-time access, confidential defaults, ID mode.
                  </div>
                  {proUpsellPreset ? (
                    <div className="mt-2 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
                      <span>Pro preset - upgrade to enable.</span>
                      <a href="/admin/upgrade" className="rounded-md border border-amber-400/40 bg-amber-400/15 px-2 py-1 text-amber-50 hover:bg-amber-400/25">
                        Upgrade to Pro
                      </a>
                    </div>
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
                  <input
                    value={sendToEmail}
                    onChange={(e) => setSendToEmail(e.target.value)}
                    placeholder="recipient@example.com (optional)"
                    className="min-w-[220px] flex-1 rounded-lg border border-white/20 bg-black/25 px-3 py-2 text-sm text-white placeholder:text-white/45"
                  />
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
