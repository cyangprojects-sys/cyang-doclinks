// src/app/d/[alias]/ShareForm.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createAndEmailShareToken, getShareStatsByToken } from "./actions";
import type { CreateShareResult, ShareStatsResult } from "./actions";
import {
  DEFAULT_PACK_ID,
  DEFAULT_SHARE_SETTINGS,
  PACKS,
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
    packId: "internal_review",
    watermarkEnabled: false,
    allowDownload: true,
    maxViews: null,
    expiryChoice: "7d",
    watermarkStrength: "light",
    watermarkPlacement: "center",
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

function RecipientField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-neutral-300">
        Recipient email (optional)
      </label>
      <div className="mt-1 text-xs text-neutral-500">
        If set, access is restricted to this recipient email.
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="recipient@example.com"
        className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-700 transition"
      />
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
  const [overrideAllowDownload, setOverrideAllowDownload] = useState<boolean | null>(null);
  const [overrideWatermarkEnabled, setOverrideWatermarkEnabled] = useState<boolean | null>(null);
  const [overrideMaxViews, setOverrideMaxViews] = useState<string>("");
  const [hasMaxViewsOverride, setHasMaxViewsOverride] = useState(false);
  const [overrideExpiresLocal, setOverrideExpiresLocal] = useState<string>("");
  const [hasExpiresOverride, setHasExpiresOverride] = useState(false);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [uiMessage, setUiMessage] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<ShareStatsResult | null>(null);
  const [createdPackId, setCreatedPackId] = useState<PackId | null>(null);
  const [adjustedForPlan, setAdjustedForPlan] = useState(false);
  const [proPackNotice, setProPackNotice] = useState<string | null>(null);
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

  async function onCreate() {
    setErr(null);
    setUiMessage(null);
    setStats(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("docId", docId);
      fd.set("alias", alias || "");
      fd.set("packId", selectedPack.id);
      if (canEditTitle) {
        fd.set("shareTitle", shareTitle.trim() ? shareTitle.trim() : "");
      }
      fd.set("toEmail", toEmail.trim() ? toEmail.trim() : "");
      fd.set("password", password);

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
      setToken(res.token);
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
      setUiMessage("Protected link created.");
    } catch (e: unknown) {
      setErr(errorMessage(e) || "Unexpected error.");
    } finally {
      setBusy(false);
    }
  }

  async function onStats() {
    if (!token) return;
    setErr(null);
    setUiMessage(null);
    setBusy(true);
    try {
      const res: ShareStatsResult = await getShareStatsByToken(token);
      if (!res.ok) {
        setErr(res.message || res.error || "Failed to load stats.");
        return;
      }
      setStats(res);
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
    if (canEditTitle) setShareTitle("");
  }

  const createdWithPack = stats?.ok
    ? getPackById(stats.row.pack_id || createdPackId || DEFAULT_PACK_ID).label
    : createdPackId
      ? getPackById(createdPackId).label
      : null;

  const isRentalPromptPack = Boolean(selectedPack.settings.collectRecipient);
  const visibleQuickPresets = QUICK_PRESETS;

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 shadow-sm sm:p-4">
      <div className="flex flex-col gap-3 sm:gap-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-200">Choose a protection preset</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Start with a preset outcome, then tweak only what you need.
          </p>
          <div className="mt-2 text-xs text-neutral-400">Most common presets</div>
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

        <div className="inline-flex w-fit rounded-lg border border-neutral-800 bg-neutral-900 p-1">
          <button
            type="button"
            onClick={() => setMode("simple")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${mode === "simple" ? "bg-neutral-100 text-neutral-950" : "text-neutral-300 hover:text-neutral-100"}`}
          >
            Simple mode
          </button>
          <button
            type="button"
            onClick={() => setMode("advanced")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${mode === "advanced" ? "bg-neutral-100 text-neutral-950" : "text-neutral-300 hover:text-neutral-100"}`}
          >
            Advanced mode
          </button>
        </div>

        {mode === "advanced" ? (
          <details
            open={showMorePresets}
            onToggle={(e) => setShowMorePresets((e.currentTarget as HTMLDetailsElement).open)}
            className="rounded-lg border border-neutral-800 bg-neutral-900"
          >
            <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-neutral-200">
              More presets
            </summary>
            <div className="border-t border-neutral-800 p-3">
              <div className="mb-3 flex items-center justify-end">
                <button
                  type="button"
                  onClick={onSaveDefaultPack}
                  className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
                >
                  Make this my default pack
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {PACKS.map((pack) => {
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
                        <span className="text-sm font-medium text-neutral-100">{pack.label}</span>
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
                      <div className="mt-1 text-xs text-neutral-400">{pack.description}</div>
                      {!available ? (
                        <div className="mt-2 text-[11px] text-neutral-300">
                          Available on Pro.
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </details>
        ) : null}
        {isFreePlan && proPackNotice ? (
          <div className="rounded-lg border border-amber-700/40 bg-amber-950/30 p-3 text-sm text-amber-100">
            <div>{proPackNotice}</div>
            <a href="/admin/upgrade" className="mt-1 inline-block text-sm font-medium text-amber-50 underline">
              {PRO_PACK_UPSELL_CTA}
            </a>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <SettingChip label="Expires" value={fmtIso(preview.expiresAt)} />
          <SettingChip label="Watermark" value={preview.watermarkEnabled ? "On" : "Off"} />
          <SettingChip label="Access" value={preview.allowDownload ? "Download allowed" : "View-only"} />
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
          <div className="text-sm font-medium text-neutral-200">Estimated outcome</div>
          <div className="mt-1 text-xs text-neutral-400">{estimatedOutcome}</div>
        </div>

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

              {isRentalPromptPack ? (
                <RecipientField value={toEmail} onChange={setToEmail} />
              ) : null}
            </div>
          </div>
        ) : (
          <details open className="rounded-lg border border-neutral-800 bg-neutral-900">
            <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-neutral-200">
              Customize
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

                {!isRentalPromptPack ? (
                  <RecipientField value={toEmail} onChange={setToEmail} />
                ) : null}

                <div>
                  <label className="text-sm font-medium text-neutral-300">
                    Password (optional)
                  </label>
                  <div className="mt-1 text-xs text-neutral-500">
                    If set, a password is required (in addition to recipient email, if enabled).
                  </div>
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Set a password"
                    type="password"
                    className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-700 transition"
                  />
                </div>

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
              Customize (optional)
            </button>
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
          <div>
            <label className="text-sm font-medium text-neutral-300">Share link</label>
            <div className="mt-1 text-xs text-neutral-500">
              Created share URL for this document.
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                readOnly
                value={shareUrl}
                className="min-w-0 flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
              />
              <button
                type="button"
                onClick={onCopyShareUrl}
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
              >
                Copy link
              </button>
              <button
                onClick={onStats}
                disabled={busy || !token}
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
              >
                Load stats
              </button>
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

        {stats?.ok ? (
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-200">
            <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
              <div>
                <span className="text-neutral-500">Created:</span>{" "}
                {fmtIso(stats.row.created_at)}
              </div>
              <div>
                <span className="text-neutral-500">Expires:</span>{" "}
                {fmtIso(stats.row.expires_at)}
              </div>
              <div>
                <span className="text-neutral-500">Max Views:</span>{" "}
                {stats.row.max_views ?? "No cap"}
              </div>
              <div>
                <span className="text-neutral-500">Views:</span>{" "}
                {stats.row.view_count ?? 0}
              </div>
              <div className="md:col-span-2">
                <span className="text-neutral-500">Recipient:</span>{" "}
                {stats.row.to_email || "Public"}
              </div>
              <div className="md:col-span-2">
                <span className="text-neutral-500">Created with:</span>{" "}
                {getPackById(stats.row.pack_id || createdPackId || DEFAULT_PACK_ID).label}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
