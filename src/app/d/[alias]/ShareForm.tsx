// src/app/d/[alias]/ShareForm.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createAndEmailShareToken } from "./actions";
import type { CreateShareResult } from "./actions";
import {
  DEFAULT_PACK_ID,
  DEFAULT_SHARE_SETTINGS,
  PRO_PACK_UPSELL_CTA,
  PRO_PACK_UPSELL_MESSAGE,
  applyPack,
  getPackById,
  isPackAvailableForPlan,
  isPackId,
  type PackId,
} from "@/lib/packs";

const DEFAULT_PACK_STORAGE_KEY = "doclinks.default_pack_id";
const LAST_PACK_STORAGE_KEY = "doclinks.last_pack_id";
type Mode = "simple" | "advanced";
type WatermarkStrength = "light" | "strong";
type WatermarkPlacement = "diagonal" | "center";
type SimpleExpiryChoice = "pack" | "none" | "24h" | "72h" | "7d" | "14d" | "30d" | "custom";
type QuickPresetId = "general_secure" | "email_safe" | "client_share";
type QuickPreset = {
  id: QuickPresetId;
  label: string;
  description: string;
  badge?: string;
  packId: PackId;
  watermarkEnabled: boolean;
  allowDownload: boolean;
  maxViews?: number | null;
  expiryChoice: SimpleExpiryChoice;
  watermarkStrength: WatermarkStrength;
  watermarkPlacement: WatermarkPlacement;
};
type ProTeaserPresetId = "one_time_share" | "legal_confidential" | "id_verification";
type ProTeaserPreset = {
  id: ProTeaserPresetId;
  label: string;
  description: string;
  bullets: [string, string, string];
};
type MorePreset = {
  id: PackId;
  label: string;
  description: string;
};

const QUICK_PRESETS: readonly QuickPreset[] = [
  {
    id: "general_secure",
    label: "General Secure Link",
    description: "Default experience for most shares.",
    badge: "Most common",
    packId: "general_secure_link",
    watermarkEnabled: false,
    allowDownload: true,
    maxViews: null,
    expiryChoice: "pack",
    watermarkStrength: "light",
    watermarkPlacement: "diagonal",
  },
  {
    id: "email_safe",
    label: "Email-safe",
    description: "Light watermark for everyday sharing.",
    badge: "Recommended",
    packId: "general_secure_link",
    watermarkEnabled: true,
    allowDownload: true,
    maxViews: null,
    expiryChoice: "14d",
    watermarkStrength: "light",
    watermarkPlacement: "diagonal",
  },
  {
    id: "client_share",
    label: "Client share",
    description: "Download-friendly with a 7-day expiry.",
    badge: "Popular",
    packId: "internal_review",
    watermarkEnabled: false,
    allowDownload: true,
    maxViews: null,
    expiryChoice: "7d",
    watermarkStrength: "light",
    watermarkPlacement: "center",
  },
];

const PRO_TEASER_PRESETS: readonly ProTeaserPreset[] = [
  {
    id: "one_time_share",
    label: "One-Time Share",
    description: "Auto-closes after first access.",
    bullets: [
      "One-view access closes automatically.",
      "Watermarked and view-only by default.",
      "Designed for handoff links that should not circulate.",
    ],
  },
  {
    id: "legal_confidential",
    label: "Legal / Confidential",
    description: "Stricter sharing + stronger watermark defaults.",
    bullets: [
      "Short expiry with limited allowed views.",
      "Watermark-on and download-off defaults.",
      "Best for sensitive HR and legal documents.",
    ],
  },
  {
    id: "id_verification",
    label: "ID / Verification",
    description: "Best for paystubs, IDs, onboarding.",
    bullets: [
      "Built for identity and verification documents.",
      "Watermarked, view-first sharing defaults.",
      "Limits casual forwarding during onboarding flows.",
    ],
  },
];

const MORE_PRESETS: readonly MorePreset[] = [
  {
    id: "job_search",
    label: "Resume / Portfolio",
    description: "Longer window for resume and portfolio sharing.",
  },
];

const EXPIRY_SECONDS_BY_CHOICE: Readonly<Record<"24h" | "72h" | "7d" | "14d" | "30d", number>> = {
  "24h": 24 * 60 * 60,
  "72h": 72 * 60 * 60,
  "7d": 7 * 24 * 60 * 60,
  "14d": 14 * 24 * 60 * 60,
  "30d": 30 * 24 * 60 * 60,
};

function fmtIso(iso: string | null) {
  if (!iso) return "No expiration";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function toIsoFromDatetimeLocal(v: string): string | "" {
  const s = (v || "").trim();
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

function toDatetimeLocalFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function maxViewsFromInput(raw: string): number | null {
  const v = raw.trim();
  if (!v) return null;
  if (!/^\d+$/.test(v)) return null;
  return Number(v);
}

function SettingChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-neutral-200">{value}</div>
    </div>
  );
}

export default function ShareForm({
  docId,
  alias,
  canEditTitle = true,
  planId = "pro",
}: {
  docId: string;
  alias?: string;
  canEditTitle?: boolean;
  planId?: string;
}) {
  function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  const [mode, setMode] = useState<Mode>("simple");
  const [selectedPackId, setSelectedPackId] = useState<PackId>(DEFAULT_PACK_ID);
  const [defaultPackId, setDefaultPackId] = useState<PackId | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<QuickPresetId | null>(null);
  const [watermarkStrength, setWatermarkStrength] = useState<WatermarkStrength>("light");
  const [watermarkPlacement, setWatermarkPlacement] = useState<WatermarkPlacement>("diagonal");
  const [simpleExpiryChoice, setSimpleExpiryChoice] = useState<SimpleExpiryChoice>("pack");

  const [shareTitle, setShareTitle] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [password, setPassword] = useState("");
  const [restrictRecipientEmail, setRestrictRecipientEmail] = useState(false);
  const [requirePasswordProtection, setRequirePasswordProtection] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);
  const [createdShareSummary, setCreatedShareSummary] = useState<{
    expiresAt: string | null;
    allowDownload: boolean;
    watermarkEnabled: boolean;
  } | null>(null);
  const [overrideAllowDownload, setOverrideAllowDownload] = useState<boolean | null>(null);
  const [overrideWatermarkEnabled, setOverrideWatermarkEnabled] = useState<boolean | null>(null);
  const [overrideMaxViews, setOverrideMaxViews] = useState<string>("");
  const [hasMaxViewsOverride, setHasMaxViewsOverride] = useState(false);
  const [overrideExpiresLocal, setOverrideExpiresLocal] = useState<string>("");
  const [hasExpiresOverride, setHasExpiresOverride] = useState(false);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [uiMessage, setUiMessage] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [createdPackId, setCreatedPackId] = useState<PackId | null>(null);
  const [adjustedForPlan, setAdjustedForPlan] = useState(false);
  const [proPackNotice, setProPackNotice] = useState<string | null>(null);
  const [activeProTeaserId, setActiveProTeaserId] = useState<ProTeaserPresetId | null>(null);
  const isFreePlan = String(planId || "").trim().toLowerCase() === "free";
  const [showMorePresets, setShowMorePresets] = useState(false);

  useEffect(() => {
    const canUsePack = (packId: string) => isPackAvailableForPlan(packId, planId);
    try {
      const savedDefault = String(window.localStorage.getItem(DEFAULT_PACK_STORAGE_KEY) || "").trim();
      const savedLast = String(window.localStorage.getItem(LAST_PACK_STORAGE_KEY) || "").trim();
      if (isPackId(savedDefault) && canUsePack(savedDefault)) {
        setDefaultPackId(savedDefault);
        setSelectedPackId(savedDefault);
        return;
      }
      if (isPackId(savedLast) && canUsePack(savedLast)) {
        setSelectedPackId(savedLast);
        if (isPackId(savedDefault) && canUsePack(savedDefault)) {
          setDefaultPackId(savedDefault);
        }
        return;
      }
      setSelectedPackId(DEFAULT_PACK_ID);
    } catch {
      // ignore storage failures
    }
  }, [planId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LAST_PACK_STORAGE_KEY, selectedPackId);
    } catch {
      // ignore storage failures
    }
  }, [selectedPackId]);

  const selectedPack = useMemo(() => getPackById(selectedPackId), [selectedPackId]);

  const packedDefaults = useMemo(
    () => applyPack(DEFAULT_SHARE_SETTINGS, selectedPack.id),
    [selectedPack.id]
  );

  const preview = useMemo(() => {
    const next = { ...packedDefaults };
    if (overrideAllowDownload != null) next.allowDownload = overrideAllowDownload;
    if (overrideWatermarkEnabled != null) next.watermarkEnabled = overrideWatermarkEnabled;
    if (hasMaxViewsOverride) next.maxViews = maxViewsFromInput(overrideMaxViews);
    if (hasExpiresOverride) {
      next.expiresAt = toIsoFromDatetimeLocal(overrideExpiresLocal) || null;
      next.expiresInSeconds = null;
    }
    return next;
  }, [
    hasExpiresOverride,
    hasMaxViewsOverride,
    overrideAllowDownload,
    overrideExpiresLocal,
    overrideMaxViews,
    overrideWatermarkEnabled,
    packedDefaults,
  ]);

  const estimatedOutcome = useMemo(() => {
    const lines: string[] = [];
    if (preview.watermarkEnabled) {
      lines.push(`Will add visible watermark (${watermarkStrength}, ${watermarkPlacement}).`);
    } else {
      lines.push("No visible watermark overlay will be added.");
    }
    lines.push(preview.allowDownload ? "Recipients can download the file." : "Recipients are limited to view-only access.");
    lines.push(preview.expiresAt ? `Link expires ${fmtIso(preview.expiresAt)}.` : "Link has no expiration.");
    if (preview.maxViews != null) {
      lines.push(`Access is capped at ${preview.maxViews} views.`);
    }
    return lines.join(" ");
  }, [preview.allowDownload, preview.expiresAt, preview.maxViews, preview.watermarkEnabled, watermarkPlacement, watermarkStrength]);

  const activeProTeaser = activeProTeaserId
    ? PRO_TEASER_PRESETS.find((preset) => preset.id === activeProTeaserId) || null
    : null;

  const watermarkingLabel = preview.watermarkEnabled
    ? watermarkStrength === "strong"
      ? "Strong"
      : "Light"
    : "Off";

  const createdExpiresLabel = fmtIso(createdShareSummary?.expiresAt ?? preview.expiresAt);
  const createdDownloadLabel = (createdShareSummary?.allowDownload ?? preview.allowDownload) ? "allowed" : "view-only";
  const createdWatermarkLabel = (createdShareSummary?.watermarkEnabled ?? preview.watermarkEnabled) ? "on" : "off";
  const qrCodeSrc = shareUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(shareUrl)}`
    : "";

  function buildSuggestedPassword(length: number = 14): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%*_-";
    const out: string[] = [];
    const bytes = new Uint8Array(length);
    window.crypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length; i += 1) {
      out.push(chars[bytes[i] % chars.length]);
    }
    return out.join("");
  }

  function clearOverrides() {
    setOverrideAllowDownload(null);
    setOverrideWatermarkEnabled(null);
    setOverrideMaxViews("");
    setHasMaxViewsOverride(false);
    setOverrideExpiresLocal("");
    setHasExpiresOverride(false);
    setSimpleExpiryChoice("pack");
    setSelectedPresetId(null);
    setWatermarkStrength("light");
    setWatermarkPlacement("diagonal");
    setAdjustedForPlan(false);
  }

  function selectPack(packId: PackId) {
    if (!isPackAvailableForPlan(packId, planId)) {
      setProPackNotice(PRO_PACK_UPSELL_MESSAGE);
      return;
    }

    setActiveProTeaserId(null);
    setProPackNotice(null);
    setUiMessage(null);
    setSelectedPackId(packId);
    clearOverrides();
  }

  function applySimpleExpiry(choice: SimpleExpiryChoice) {
    setSimpleExpiryChoice(choice);
    if (choice === "pack") {
      setHasExpiresOverride(false);
      setOverrideExpiresLocal("");
      return;
    }
    if (choice === "none") {
      setHasExpiresOverride(true);
      setOverrideExpiresLocal("");
      return;
    }
    if (choice === "custom") {
      setHasExpiresOverride(true);
      if (!overrideExpiresLocal.trim()) {
        const defaultIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        setOverrideExpiresLocal(toDatetimeLocalFromIso(defaultIso));
      }
      return;
    }
    const seconds = EXPIRY_SECONDS_BY_CHOICE[choice];
    const iso = new Date(Date.now() + seconds * 1000).toISOString();
    setHasExpiresOverride(true);
    setOverrideExpiresLocal(toDatetimeLocalFromIso(iso));
  }

  function applyQuickPreset(presetId: QuickPresetId) {
    const preset = QUICK_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    if (!isPackAvailableForPlan(preset.packId, planId)) {
      setProPackNotice(PRO_PACK_UPSELL_MESSAGE);
      return;
    }
    setActiveProTeaserId(null);
    setProPackNotice(null);
    setErr(null);
    setUiMessage(null);
    setSelectedPresetId(preset.id);
    setSelectedPackId(preset.packId);
    setOverrideAllowDownload(preset.allowDownload);
    setOverrideWatermarkEnabled(preset.watermarkEnabled);
    if (preset.maxViews !== undefined) {
      setHasMaxViewsOverride(true);
      setOverrideMaxViews(preset.maxViews == null ? "" : String(preset.maxViews));
    } else {
      setHasMaxViewsOverride(false);
      setOverrideMaxViews("");
    }
    setWatermarkStrength(preset.watermarkStrength);
    setWatermarkPlacement(preset.watermarkPlacement);
    applySimpleExpiry(preset.expiryChoice);
    setAdjustedForPlan(false);
  }

  function onSelectProTeaser(presetId: ProTeaserPresetId) {
    setActiveProTeaserId(presetId);
    setProPackNotice(null);
  }

  async function onCreate() {
    setErr(null);
    setUiMessage(null);
    setShowQrCode(false);
    const nextToEmail = restrictRecipientEmail ? toEmail.trim().toLowerCase() : "";
    const nextPassword = requirePasswordProtection ? password : "";
    if (restrictRecipientEmail && !nextToEmail) {
      setErr("Enter a recipient email or turn off recipient restriction.");
      return;
    }
    if (requirePasswordProtection && !nextPassword.trim()) {
      setErr("Enter a password or turn off password protection.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("docId", docId);
      fd.set("alias", alias || "");
      fd.set("packId", selectedPack.id);
      if (canEditTitle) {
        fd.set("shareTitle", shareTitle.trim() ? shareTitle.trim() : "");
      }
      fd.set("toEmail", nextToEmail);
      fd.set("password", nextPassword);

      if (overrideAllowDownload != null) {
        fd.set("overrideAllowDownload", overrideAllowDownload ? "1" : "0");
      }
      if (overrideWatermarkEnabled != null) {
        fd.set("overrideWatermarkEnabled", overrideWatermarkEnabled ? "1" : "0");
      }
      if (hasExpiresOverride) {
        fd.set("overrideExpiresAt", toIsoFromDatetimeLocal(overrideExpiresLocal));
      }
      if (hasMaxViewsOverride) {
        fd.set("overrideMaxViews", overrideMaxViews.trim());
      }

      const res: CreateShareResult = await createAndEmailShareToken(fd);
      if (!res.ok) {
        setErr(res.message || res.error || "Failed to create token.");
        if (res.error === "PACK_REQUIRES_PRO") {
          setProPackNotice(PRO_PACK_UPSELL_MESSAGE);
        }
        return;
      }
      if (isPackId(res.packId)) {
        setCreatedPackId(res.packId);
      } else {
        setCreatedPackId(selectedPack.id);
      }
      setAdjustedForPlan(Boolean(res.adjustedForPlan));
      const resolvedUrl =
        (typeof res.url === "string" && res.url.trim()) ||
        `${window.location.origin}/s/${encodeURIComponent(String(res.token || ""))}`;
      setShareUrl(resolvedUrl);
      setCreatedShareSummary({
        expiresAt: preview.expiresAt,
        allowDownload: preview.allowDownload,
        watermarkEnabled: preview.watermarkEnabled,
      });
      setUiMessage("Protected link created.");
    } catch (e: unknown) {
      setErr(errorMessage(e) || "Unexpected error.");
    } finally {
      setBusy(false);
    }
  }

  async function onCopyShareUrl() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setUiMessage("Share link copied.");
    } catch {
      setErr("Unable to copy link. Copy manually from the field.");
    }
  }

  function onEmailShare() {
    if (!shareUrl) return;
    const subject = encodeURIComponent("Protected document link");
    const body = encodeURIComponent(`Here is the protected link:\n\n${shareUrl}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  function onGeneratePassword() {
    const generated = buildSuggestedPassword();
    setPassword(generated);
    setRequirePasswordProtection(true);
    setUiMessage("Generated a strong password.");
  }

  function onSaveDefaultPack() {
    try {
      window.localStorage.setItem(DEFAULT_PACK_STORAGE_KEY, selectedPack.id);
      setDefaultPackId(selectedPack.id);
      setUiMessage(`Saved "${selectedPack.label}" as your default pack.`);
    } catch {
      setErr("Unable to save default pack on this browser.");
    }
  }

  async function onExportConfig() {
    const payload = {
      mode,
      packId: selectedPack.id,
      preview,
      watermarkProfile: {
        strength: watermarkStrength,
        placement: watermarkPlacement,
      },
      overrides: {
        allowDownload: overrideAllowDownload,
        watermarkEnabled: overrideWatermarkEnabled,
        maxViews: hasMaxViewsOverride ? maxViewsFromInput(overrideMaxViews) : "pack-default",
        expiresAt: hasExpiresOverride ? (toIsoFromDatetimeLocal(overrideExpiresLocal) || null) : "pack-default",
      },
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setUiMessage("Config copied to clipboard.");
    } catch {
      setErr("Unable to export config from this browser.");
    }
  }

  function onResetAll() {
    setErr(null);
    setUiMessage(null);
    clearOverrides();
    setToEmail("");
    setPassword("");
    setRestrictRecipientEmail(false);
    setRequirePasswordProtection(false);
    setShowQrCode(false);
    if (canEditTitle) setShareTitle("");
  }

  const createdWithPack = createdPackId
    ? getPackById(createdPackId).label
    : null;

  const visibleQuickPresets = QUICK_PRESETS;

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 shadow-sm sm:p-4">
      <div className="flex flex-col gap-3 sm:gap-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-200">Choose a protection preset</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Pick a preset. Everything is secure by default.
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="text-xs text-neutral-400">Most common (Free)</div>
            <button
              type="button"
              onClick={onSaveDefaultPack}
              className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
            >
              Make this my default pack
            </button>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
            {visibleQuickPresets.map((preset) => {
              const selected = selectedPresetId === preset.id;
              const available = isPackAvailableForPlan(preset.packId, planId);
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyQuickPreset(preset.id)}
                  className={`rounded-lg border p-3 text-left transition ${selected
                    ? "border-cyan-500/50 bg-cyan-500/10"
                    : available
                      ? "border-neutral-800 bg-neutral-900 hover:border-neutral-700"
                      : "border-neutral-800/80 bg-neutral-900/80 hover:border-neutral-700"
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-100">{preset.label}</span>
                    {preset.badge ? (
                      <span className="rounded-full border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-300">
                        {preset.badge}
                      </span>
                    ) : null}
                    {getPackById(preset.packId).minPlan === "pro" ? (
                      <span className="rounded-full border border-amber-700/40 bg-amber-950/40 px-2 py-0.5 text-[10px] text-amber-100">
                        Pro
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs text-neutral-400">{preset.description}</div>
                  {!available ? (
                    <div className="mt-2 text-[11px] text-neutral-300">
                      Upgrade to use this preset.
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {isFreePlan ? (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
            <div className="text-xs font-semibold text-neutral-400">
              Pro presets
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {PRO_TEASER_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelectProTeaser(preset.id)}
                  className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-left transition hover:border-neutral-700"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-neutral-200">{preset.label}</span>
                    <span className="rounded-full border border-amber-700/40 bg-amber-950/40 px-2 py-0.5 text-[10px] text-amber-100">
                      Locked
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] leading-4 text-neutral-400">{preset.description}</div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {isFreePlan && activeProTeaser ? (
          <div className="rounded-lg border border-amber-700/40 bg-amber-950/25 p-3">
            <div className="text-sm font-semibold text-amber-100">Unlock Pro presets</div>
            <div className="mt-1 text-xs text-amber-200">
              {activeProTeaser.label} helps when you need tighter sharing controls.
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-100">
              {activeProTeaser.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
            <div className="mt-2 text-xs text-amber-200">$12/mo</div>
            <a
              href="/admin/upgrade"
              className="mt-2 inline-block rounded-md border border-amber-600/60 bg-amber-400/10 px-2.5 py-1.5 text-xs font-medium text-amber-50 hover:bg-amber-400/20"
            >
              Upgrade to Pro
            </a>
          </div>
        ) : null}

        <details
          open={showMorePresets}
          onToggle={(e) => setShowMorePresets((e.currentTarget as HTMLDetailsElement).open)}
          className="rounded-lg border border-neutral-800 bg-neutral-900"
        >
          <summary className="cursor-pointer list-none px-3 py-2">
            <span className="text-sm font-semibold text-neutral-200">More presets</span>
            <span className="ml-2 text-xs text-neutral-500">Optional</span>
          </summary>
          <div className="border-t border-neutral-800 p-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {MORE_PRESETS.map((preset) => {
                const pack = getPackById(preset.id);
                const selected = pack.id === selectedPack.id;
                const available = isPackAvailableForPlan(pack, planId);
                return (
                  <button
                    key={pack.id}
                    type="button"
                    onClick={() => selectPack(pack.id)}
                    className={`rounded-lg border p-3 text-left transition ${selected
                      ? "border-cyan-500/50 bg-cyan-500/10"
                      : available
                        ? "border-neutral-800 bg-neutral-900 hover:border-neutral-700"
                        : "border-neutral-800/80 bg-neutral-900/80 hover:border-neutral-700"
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-neutral-100">{preset.label}</span>
                      {pack.minPlan === "pro" ? (
                        <span className="rounded-full border border-amber-700/40 bg-amber-950/40 px-2 py-0.5 text-[10px] text-amber-100">
                          Pro
                        </span>
                      ) : null}
                      {defaultPackId === pack.id ? (
                        <span className="rounded-full border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-300">
                          default
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-neutral-400">{preset.description}</div>
                    {!available ? (
                      <div className="mt-2 text-[11px] text-neutral-300">
                        Requires Pro.
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </details>

        {isFreePlan && proPackNotice ? (
          <div className="rounded-lg border border-amber-700/40 bg-amber-950/30 p-3 text-sm text-amber-100">
            <div>{proPackNotice}</div>
            <a href="/admin/upgrade" className="mt-1 inline-block text-sm font-medium text-amber-50 underline">
              {PRO_PACK_UPSELL_CTA}
            </a>
          </div>
        ) : null}

        <div>
          <h3 className="text-sm font-semibold text-neutral-200">Your settings</h3>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <SettingChip label="Link expires" value={fmtIso(preview.expiresAt)} />
            <SettingChip label="Watermarking" value={watermarkingLabel} />
            <SettingChip label="Viewing" value={preview.allowDownload ? "Download allowed" : "View-only"} />
          </div>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
          <div className="text-sm font-medium text-neutral-200">Estimated outcome</div>
          <div className="mt-1 text-xs text-neutral-400">{estimatedOutcome}</div>
        </div>

        {mode === "advanced" ? (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-neutral-300">
            Advanced mode is on.
            <button
              type="button"
              onClick={() => setMode("simple")}
              className="ml-2 text-neutral-200 underline underline-offset-2 hover:text-white"
            >
              Back to simple mode
            </button>
          </div>
        ) : null}

        {mode === "simple" ? (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
            <div className="text-sm font-medium text-neutral-200">Quick settings</div>
            <div className="mt-3 flex flex-col gap-4">
              <div className="flex flex-wrap gap-3">
                <div className="min-w-[160px] flex-1">
                  <label className="text-sm font-medium text-neutral-300">Watermark</label>
                  <p className="mt-1 text-xs text-neutral-500">Recommended for external shares.</p>
                  <label className="mt-2 inline-flex items-center gap-2 text-sm text-neutral-200">
                    <input
                      type="checkbox"
                      checked={preview.watermarkEnabled}
                      onChange={(e) => setOverrideWatermarkEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-neutral-700 bg-neutral-950 text-cyan-400 focus:ring-cyan-500"
                    />
                    Enable watermark
                  </label>
                </div>

                <div className="min-w-[210px] flex-1">
                  <label className="text-sm font-medium text-neutral-300">Watermark strength</label>
                  <p className="mt-1 text-xs text-neutral-500">Most common: light.</p>
                  <div className="mt-2 inline-flex max-w-full rounded-lg border border-neutral-700 bg-neutral-950 p-1">
                    {(["light", "strong"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setWatermarkStrength(v)}
                        className={`rounded-md px-3 py-1 text-xs font-medium ${watermarkStrength === v ? "bg-neutral-100 text-neutral-950" : "text-neutral-300 hover:text-neutral-100"}`}
                      >
                        {v === "light" ? "Light" : "Strong"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="min-w-[230px] flex-1">
                  <label className="text-sm font-medium text-neutral-300">Watermark placement</label>
                  <p className="mt-1 text-xs text-neutral-500">Choose diagonal or center emphasis.</p>
                  <div className="mt-2 inline-flex max-w-full rounded-lg border border-neutral-700 bg-neutral-950 p-1">
                    {(["diagonal", "center"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setWatermarkPlacement(v)}
                        className={`rounded-md px-3 py-1 text-xs font-medium ${watermarkPlacement === v ? "bg-neutral-100 text-neutral-950" : "text-neutral-300 hover:text-neutral-100"}`}
                      >
                        {v === "diagonal" ? "Diagonal" : "Center"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-neutral-300">Expiry</label>
                <p className="mt-1 text-xs text-neutral-500">Most common: 7 days.</p>
                <select
                  value={simpleExpiryChoice}
                  onChange={(e) => applySimpleExpiry(e.target.value as SimpleExpiryChoice)}
                  className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-700 transition"
                >
                  <option value="pack">Use pack default</option>
                  <option value="24h">24 hours</option>
                  <option value="72h">72 hours</option>
                  <option value="7d">7 days</option>
                  <option value="14d">14 days</option>
                  <option value="30d">30 days</option>
                  <option value="none">No expiration</option>
                  <option value="custom">Custom date/time</option>
                </select>
                {simpleExpiryChoice === "custom" ? (
                  <input
                    value={overrideExpiresLocal}
                    onChange={(e) => {
                      setHasExpiresOverride(true);
                      setOverrideExpiresLocal(e.target.value);
                    }}
                    type="datetime-local"
                    className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-700 transition"
                  />
                ) : null}
              </div>

              <div>
                <label className="text-sm font-medium text-neutral-300">Download access</label>
                <p className="mt-1 text-xs text-neutral-500">Disable for view-only delivery.</p>
                <label className="mt-2 inline-flex items-center gap-2 text-sm text-neutral-200">
                  <input
                    type="checkbox"
                    checked={preview.allowDownload}
                    onChange={(e) => setOverrideAllowDownload(e.target.checked)}
                    className="h-4 w-4 rounded border-neutral-700 bg-neutral-950 text-cyan-400 focus:ring-cyan-500"
                  />
                  Allow download
                </label>
              </div>

            </div>
          </div>
        ) : (
          <details open className="rounded-lg border border-neutral-800 bg-neutral-900">
            <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-neutral-200">
              Fine-tune settings
            </summary>
            <div className="border-t border-neutral-800 p-3">
              <div className="flex flex-col gap-3">
                {canEditTitle ? (
                  <div>
                    <label className="text-sm font-medium text-neutral-300">
                      Title before sharing (optional)
                    </label>
                    <div className="mt-1 text-xs text-neutral-500">
                      If set, updates this document title before creating the share link.
                    </div>
                    <input
                      value={shareTitle}
                      onChange={(e) => setShareTitle(e.target.value)}
                      placeholder="Leave blank to keep current title"
                      className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-700 transition"
                    />
                  </div>
                ) : null}

                <label className="flex items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200">
                  <input
                    type="checkbox"
                    checked={preview.allowDownload}
                    onChange={(e) => setOverrideAllowDownload(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-neutral-700 bg-neutral-950 text-cyan-400 focus:ring-cyan-500"
                  />
                  <span>
                    <span className="font-medium text-neutral-200">Allow recipient download</span>
                    <span className="mt-1 block text-xs text-neutral-500">
                      If disabled, recipients can preview but cannot download.
                    </span>
                    <button
                      type="button"
                      onClick={() => setOverrideAllowDownload(null)}
                      className="mt-1 text-[11px] text-cyan-300 hover:underline"
                    >
                      Use pack default
                    </button>
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200">
                  <input
                    type="checkbox"
                    checked={preview.watermarkEnabled}
                    onChange={(e) => setOverrideWatermarkEnabled(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-neutral-700 bg-neutral-950 text-cyan-400 focus:ring-cyan-500"
                  />
                  <span>
                    <span className="font-medium text-neutral-200">Enable watermark</span>
                    <span className="mt-1 block text-xs text-neutral-500">
                      Adds share-level watermark overlay for inline previews.
                    </span>
                    <button
                      type="button"
                      onClick={() => setOverrideWatermarkEnabled(null)}
                      className="mt-1 text-[11px] text-cyan-300 hover:underline"
                    >
                      Use pack default
                    </button>
                  </span>
                </label>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-neutral-300">
                      Max Views (optional)
                    </label>
                    <div className="mt-1 text-xs text-neutral-500">
                      Leave blank for no share-level cap. Use 1 for single-view delivery.
                    </div>
                    <input
                      value={hasMaxViewsOverride ? overrideMaxViews : ""}
                      onChange={(e) => {
                        setHasMaxViewsOverride(true);
                        setOverrideMaxViews(e.target.value);
                      }}
                      placeholder={
                        packedDefaults.maxViews == null ? "Pack default: unlimited" : `Pack default: ${packedDefaults.maxViews}`
                      }
                      inputMode="numeric"
                      className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-700 transition"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setHasMaxViewsOverride(false);
                        setOverrideMaxViews("");
                      }}
                      className="mt-1 text-[11px] text-cyan-300 hover:underline"
                    >
                      Use pack default
                    </button>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-neutral-300">
                      Expiration (optional)
                    </label>
                    <div className="mt-1 text-xs text-neutral-500">
                      When set, access stops at this exact time.
                    </div>
                    <input
                      value={hasExpiresOverride ? overrideExpiresLocal : ""}
                      onChange={(e) => {
                        setHasExpiresOverride(true);
                        setOverrideExpiresLocal(e.target.value);
                        setSimpleExpiryChoice("custom");
                      }}
                      type="datetime-local"
                      className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-700 transition"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setHasExpiresOverride(false);
                        setOverrideExpiresLocal("");
                        setSimpleExpiryChoice("pack");
                      }}
                      className="mt-1 text-[11px] text-cyan-300 hover:underline"
                    >
                      Use pack default
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </details>
        )}

        <div className="sticky bottom-0 z-10 -mx-3 border-t border-neutral-800 bg-neutral-950/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onCreate}
              disabled={busy || !docId}
              className="flex-1 rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-white disabled:opacity-50"
            >
              {busy ? "Generating..." : "Generate Protected Link"}
            </button>
            <button
              type="button"
              onClick={() => setMode("advanced")}
              className="text-xs text-neutral-300 underline underline-offset-2 hover:text-neutral-100"
            >
              Fine-tune settings (optional)
            </button>
          </div>
          <div className="mt-2 text-xs text-neutral-400">
            Need stricter sharing?{" "}
            <a href="/admin/upgrade" className="text-neutral-200 underline underline-offset-2 hover:text-white">
              Unlock Pro presets (one-time access, confidential, ID mode).
            </a>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onResetAll}
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={onSaveDefaultPack}
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
            >
              Save preset
            </button>
            <button
              type="button"
              onClick={onExportConfig}
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
            >
              Export config
            </button>
          </div>
        </div>

        {adjustedForPlan ? (
          <div className="rounded-lg border border-amber-700/40 bg-amber-950/30 p-3 text-sm text-amber-100">
            {isFreePlan ? "Adjusted for Free tier." : "Adjusted for your current plan limits."}
          </div>
        ) : null}

        {uiMessage ? (
          <div className="rounded-lg border border-emerald-700/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">
            {uiMessage}
          </div>
        ) : null}

        {shareUrl ? (
          <div className="rounded-lg border border-emerald-700/30 bg-emerald-950/15 p-3">
            <div className="text-sm font-semibold text-emerald-100">✅ Protected link created</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onCopyShareUrl}
                className="rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-white"
              >
                Copy link
              </button>
              <button
                type="button"
                onClick={onEmailShare}
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
              >
                Email link
              </button>
              <button
                type="button"
                onClick={() => setShowQrCode((prev) => !prev)}
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
              >
                {showQrCode ? "Hide QR code" : "QR code"}
              </button>
            </div>
            <input
              readOnly
              value={shareUrl}
              className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
            />
            <div className="mt-2 text-xs text-neutral-300">
              Link expires: {createdExpiresLabel} • Download: {createdDownloadLabel} • Watermark: {createdWatermarkLabel}
            </div>

            {showQrCode && qrCodeSrc ? (
              <div className="mt-3 w-fit rounded-lg border border-neutral-800 bg-neutral-900 p-2">
                <img src={qrCodeSrc} alt="QR code for share link" className="h-44 w-44 rounded bg-white p-1" />
              </div>
            ) : null}

            <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              <div className="text-sm font-medium text-neutral-200">Optional security</div>
              <div className="mt-2 space-y-3">
                <label className="flex items-center gap-2 text-sm text-neutral-200">
                  <input
                    type="checkbox"
                    checked={restrictRecipientEmail}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setRestrictRecipientEmail(enabled);
                      if (!enabled) setToEmail("");
                    }}
                    className="h-4 w-4 rounded border-neutral-700 bg-neutral-950 text-cyan-400 focus:ring-cyan-500"
                  />
                  Restrict to recipient email
                </label>
                {restrictRecipientEmail ? (
                  <input
                    value={toEmail}
                    onChange={(e) => setToEmail(e.target.value)}
                    type="email"
                    placeholder="recipient@example.com"
                    className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-700 transition"
                  />
                ) : null}

                <label className="flex items-center gap-2 text-sm text-neutral-200">
                  <input
                    type="checkbox"
                    checked={requirePasswordProtection}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setRequirePasswordProtection(enabled);
                      if (!enabled) setPassword("");
                    }}
                    className="h-4 w-4 rounded border-neutral-700 bg-neutral-950 text-cyan-400 focus:ring-cyan-500"
                  />
                  Add password
                </label>
                {requirePasswordProtection ? (
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Set a password"
                      type="text"
                      className="min-w-0 flex-1 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-700 transition"
                    />
                    <button
                      type="button"
                      onClick={onGeneratePassword}
                      className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
                    >
                      Generate password
                    </button>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={onCreate}
                  disabled={busy || !docId}
                  className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:bg-neutral-800 disabled:opacity-50"
                >
                  {busy ? "Generating..." : "Generate updated link"}
                </button>
              </div>
            </div>

            {createdWithPack ? (
              <div className="mt-2 text-xs text-neutral-400">
                Created with: <span className="text-neutral-200">{createdWithPack}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {err ? (
          <div className="rounded-lg border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-200">
            {err}
          </div>
        ) : null}
      </div>
    </div>
  );
}
