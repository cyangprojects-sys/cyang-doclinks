"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createAndEmailShareToken } from "@/app/d/[alias]/actions";
import { isPackAvailableForPlan, type PackId } from "@/lib/packs";
import { getDocumentUiStatus, getShareEligibility, normalizeDocState, normalizeScanState } from "@/lib/documentStatus";

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

export default function DashboardHeaderActions(props: {
  docs: DocOption[];
  planId: string;
  mode?: "default" | "modal-only";
  uploadPickerHref?: string;
  createLinkFallbackHref?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
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
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const mode = props.mode ?? "default";

  function clearCreateParams() {
    const params = new URLSearchParams(sp.toString());
    params.delete("createLink");
    params.delete("docId");
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

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
      const scanStateNormalized = normalizeScanState(d.scanState, d.moderationStatus);
      const canCreateNow = eligibility.canCreateLink && scanStateNormalized === "CLEAN";
      const shareBlockedReason =
        scanStateNormalized !== "CLEAN"
          ? "Available after scan completes."
          : eligibility.blockedReason || "This file cannot be shared yet.";
      return { ...d, ui, eligibility, scanStateNormalized, canCreateNow, shareBlockedReason };
    });
  }, [props.docs]);
  const hasAnyDocs = docsWithStatus.length > 0;
  const hasReadyCleanDoc = useMemo(() => {
    return docsWithStatus.some((d) => {
      const docState = normalizeDocState(d.docState);
      const scanState = normalizeScanState(d.scanState, d.moderationStatus);
      return d.eligibility.canCreateLink && docState === "READY" && scanState === "CLEAN";
    });
  }, [docsWithStatus]);
  const uploadPickerHref = props.uploadPickerHref ?? "/admin?openPicker=1";
  const createLinkUploadHref = props.createLinkFallbackHref ?? "/admin?openPicker=1&fromCreateLink=1";

  useEffect(() => {
    if (!docsWithStatus.length) {
      setSelectedDocId("");
      setShareWarning(null);
      return;
    }
    if (selectedDocId && docsWithStatus.some((d) => d.docId === selectedDocId)) {
      const current = docsWithStatus.find((d) => d.docId === selectedDocId);
      setShareWarning(current ? (current.canCreateNow ? current.eligibility.warning ?? null : current.shareBlockedReason) : null);
      return;
    }
    const firstEligible = docsWithStatus.find((d) => d.canCreateNow);
    setSelectedDocId(firstEligible?.docId || docsWithStatus[0].docId);
    setShareWarning(firstEligible?.eligibility.warning ?? "Available after scan completes.");
  }, [docsWithStatus, selectedDocId]);

  useEffect(() => {
    const requestedOpen = sp.get("createLink") === "1";
    const requestedDocId = String(sp.get("docId") || "").trim();
    if (requestedOpen) {
      if (!requestedDocId && !hasReadyCleanDoc) {
        setOpen(false);
        router.replace(createLinkUploadHref, { scroll: false });
        return;
      }
      setOpen(true);
    }
    if (!requestedDocId) return;
    const doc = docsWithStatus.find((d) => d.docId === requestedDocId);
    if (!doc) return;
    setSelectedDocId(doc.docId);
    setShareWarning(doc.canCreateNow ? doc.eligibility.warning ?? null : doc.shareBlockedReason);
  }, [sp, docsWithStatus, hasReadyCleanDoc, createLinkUploadHref, router]);

  const filteredDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docsWithStatus;
    return docsWithStatus.filter((d) => `${d.title} ${d.docId}`.toLowerCase().includes(q));
  }, [docsWithStatus, query]);

  function onPrimaryCreateClick() {
    if (!hasReadyCleanDoc) {
      router.push(createLinkUploadHref);
      return;
    }
    resetFlow();
    setOpen(true);
  }

  function resetFlow() {
    setErr(null);
    setCreatedUrl(null);
    setPreset("general_secure");
    setSendToEmail("");
    setProUpsellPreset(null);
    setShowUpgradePrompt(false);
    const current = docsWithStatus.find((d) => d.docId === selectedDocId);
    setShareWarning(current?.eligibility.warning ?? null);
  }

  function shouldShowUpgradePrompt(message: string, errorCode?: string | null): boolean {
    const code = String(errorCode || "").toUpperCase();
    if (code === "PACK_REQUIRES_PRO" || code === "PLAN_REQUIRED") return true;
    const m = message.toLowerCase();
    return (
      m.includes("upgrade") ||
      m.includes("requires pro") ||
      m.includes("pro preset") ||
      m.includes("plan") ||
      m.includes("limit")
    );
  }

  async function onCreateLink() {
    setErr(null);
    if (!selectedDocId) {
      setErr("Pick a file first.");
      return;
    }
    const selectedDoc = docsWithStatus.find((d) => d.docId === selectedDocId);
    if (!selectedDoc) {
      setErr("File not found.");
      return;
    }
    if (!selectedDoc.canCreateNow) {
      setErr(selectedDoc.shareBlockedReason);
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
      setShowUpgradePrompt(true);
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
        const msg = res.message || res.error || "Unable to create link.";
        setErr(msg);
        setShowUpgradePrompt(shouldShowUpgradePrompt(msg, res.error));
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
      setShowUpgradePrompt(false);
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
    const subject = encodeURIComponent("Protected file link");
    const body = encodeURIComponent(`Here is your protected link:\n\n${createdUrl}`);
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  }

  return (
    <>
      {mode === "default" ? (
        <div className="flex w-full flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onPrimaryCreateClick}
            className="btn-base h-[56px] w-[220px] rounded-lg border border-cyan-300/45 bg-cyan-400 px-4 py-2 text-sm font-semibold text-[#04111e] shadow-[0_6px_20px_rgba(34,211,238,0.28)] hover:bg-cyan-300"
          >
            <span className="flex flex-col items-start leading-tight">
              <span>{hasAnyDocs ? "Create protected link" : "Upload a file"}</span>
              <span className={`text-[11px] font-medium text-[#0f2a3a]/80 ${hasAnyDocs ? "invisible" : ""}`}>then create a link</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => router.push(uploadPickerHref)}
            className="btn-base h-[56px] w-[220px] rounded-lg border border-amber-300/45 bg-amber-300/18 px-3.5 py-2 text-sm font-medium text-amber-50 shadow-[0_5px_14px_rgba(251,191,36,0.18)] hover:bg-amber-300/24"
          >
            Upload file
          </button>
        </div>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/15 bg-[#0b1220] p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Create protected link</h3>
                <p className="mt-1 text-xs text-white/60">Choose a file, choose a preset, create the link, then share it.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  clearCreateParams();
                }}
                className="btn-base btn-secondary rounded-lg px-2 py-1 text-xs"
              >
                Close
              </button>
            </div>

            {!createdUrl ? (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">Step 1</div>
                  <label className="mt-2 block text-sm text-white/80">Choose file</label>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by file name..."
                    className="mt-1 w-full rounded-lg border border-white/20 bg-black/25 px-3 py-2 text-sm text-white placeholder:text-white/45"
                  />
                  <select
                    value={selectedDocId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSelectedDocId(nextId);
                      const doc = docsWithStatus.find((d) => d.docId === nextId);
                      setShareWarning(doc ? (doc.canCreateNow ? doc.eligibility.warning ?? null : doc.shareBlockedReason) : null);
                    }}
                    className="mt-2 w-full rounded-lg border border-white/20 bg-white px-3 py-2 text-sm text-black"
                    style={{ colorScheme: "light" }}
                  >
                    {filteredDocs.map((d) => (
                      <option key={d.docId} value={d.docId} disabled={!d.canCreateNow} title={d.canCreateNow ? d.ui.subtext : d.shareBlockedReason} className="bg-white text-black">
                        {`${d.title} - ${
                          d.scanStateNormalized === "PENDING" || d.scanStateNormalized === "RUNNING" || d.scanStateNormalized === "NOT_SCHEDULED"
                            ? "Scanning..."
                            : d.ui.label
                        }${d.canCreateNow ? "" : " (Unavailable)"}`}
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
                  {showUpgradePrompt ? (
                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-2 text-xs text-amber-100">
                      <span>Need stricter controls or higher limits?</span>
                      <a href="/admin/upgrade" className="rounded-md border border-amber-400/40 bg-amber-400/15 px-2 py-1 text-amber-50 hover:bg-amber-400/25">
                        Upgrade to Pro
                      </a>
                    </div>
                  ) : null}
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
