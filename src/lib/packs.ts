export type PackId =
  | "general_secure_link"
  | "job_search"
  | "marketplace_sale"
  | "internal_review"
  | "one_time_share"
  | "id_verification"
  | "client_delivery"
  | "legal_confidential"
  | "executive_brief";

export type PackTier = "free" | "pro";
export type PasswordMode = "user" | "generated";

export type ShareSettings = {
  expiresAt: string | null;
  expiresInSeconds: number | null;
  watermarkEnabled: boolean;
  allowDownload: boolean;
  maxViews: number | null;
  collectRecipient: boolean;
  requireEmail: boolean;
  requireOtp: boolean;
  passwordRequired: boolean;
  passwordMode: PasswordMode | null;
};

export type ShareSettingsPatch = Partial<ShareSettings>;

export type PackDefinition = {
  id: PackId;
  version: number;
  minPlan: PackTier;
  label: string;
  description: string;
  settings: ShareSettingsPatch;
  recommendedFor?: string[];
};

const MAX_PACK_ID_INPUT_LEN = 64;
const MAX_EXPIRES_IN_SECONDS = 365 * 24 * 60 * 60;
const MAX_MAX_VIEWS = 1_000_000;

export const PRO_PACK_UPSELL_MESSAGE =
  "This pack requires Pro because it enables stricter controls (one-time view / highly restricted sharing).";

export const PRO_PACK_UPSELL_CTA = "Upgrade to use this pack.";

export const DEFAULT_PACK_ID: PackId = "general_secure_link";

export const DEFAULT_SHARE_SETTINGS: ShareSettings = {
  expiresAt: null,
  expiresInSeconds: null,
  watermarkEnabled: false,
  allowDownload: true,
  maxViews: null,
  collectRecipient: false,
  requireEmail: false,
  requireOtp: false,
  passwordRequired: false,
  passwordMode: null,
};

export const PACKS: readonly PackDefinition[] = [
  {
    id: "general_secure_link",
    version: 1,
    minPlan: "free",
    label: "General Secure Link",
    description: "Default experience for most shares.",
    settings: {},
    recommendedFor: ["General use"],
  },
  {
    id: "job_search",
    version: 1,
    minPlan: "free",
    label: "Job Search",
    description: "Longer window for resume, portfolio, and hiring flows.",
    settings: {
      expiresInSeconds: 30 * 24 * 60 * 60,
      watermarkEnabled: false,
      allowDownload: true,
      maxViews: null,
    },
    recommendedFor: ["Portfolio", "Recruiters"],
  },
  {
    id: "marketplace_sale",
    version: 1,
    minPlan: "free",
    label: "Marketplace Sale",
    description: "Short-lived, watermarked, view-only sharing for listings.",
    settings: {
      expiresInSeconds: 3 * 24 * 60 * 60,
      watermarkEnabled: true,
      allowDownload: false,
      maxViews: null,
    },
    recommendedFor: ["Listings", "High-frequency sends"],
  },
  {
    id: "internal_review",
    version: 1,
    minPlan: "free",
    label: "Internal Review",
    description: "Low-friction team review mode.",
    settings: {
      expiresInSeconds: 14 * 24 * 60 * 60,
      watermarkEnabled: false,
      allowDownload: true,
      maxViews: null,
    },
    recommendedFor: ["Team review", "Feedback pass"],
  },
  {
    id: "one_time_share",
    version: 1,
    minPlan: "pro",
    label: "One-Time Share",
    description: "Share once and automatically close access.",
    settings: {
      expiresInSeconds: 24 * 60 * 60,
      watermarkEnabled: true,
      allowDownload: false,
      maxViews: 1,
    },
    recommendedFor: ["Strict handoff", "One-time access"],
  },
  {
    id: "id_verification",
    version: 1,
    minPlan: "pro",
    label: "ID / Verification",
    description: "Secure sharing for IDs, paystubs, onboarding, and applications.",
    settings: {
      expiresInSeconds: 7 * 24 * 60 * 60,
      watermarkEnabled: true,
      allowDownload: false,
      maxViews: 10,
    },
    recommendedFor: ["Onboarding", "Application docs"],
  },
  {
    id: "client_delivery",
    version: 1,
    minPlan: "pro",
    label: "Client Delivery",
    description: "Longer-lived links for final deliverables clients keep.",
    settings: {
      expiresInSeconds: 30 * 24 * 60 * 60,
      watermarkEnabled: false,
      allowDownload: true,
      maxViews: null,
    },
    recommendedFor: ["Freelancer handoff", "Final files"],
  },
  {
    id: "legal_confidential",
    version: 1,
    minPlan: "pro",
    label: "Legal / Confidential",
    description: "Serious mode for sensitive legal and HR documents.",
    settings: {
      expiresInSeconds: 7 * 24 * 60 * 60,
      watermarkEnabled: true,
      allowDownload: false,
      maxViews: 3,
    },
    recommendedFor: ["Legal disputes", "Sensitive HR"],
  },
  {
    id: "executive_brief",
    version: 1,
    minPlan: "pro",
    label: "Executive Brief",
    description: "Tight-window sharing for executive and board docs.",
    settings: {
      expiresInSeconds: 72 * 60 * 60,
      watermarkEnabled: true,
      allowDownload: false,
      maxViews: 5,
    },
    recommendedFor: ["Board review", "Executive updates"],
  },
];

const PACK_BY_ID: Readonly<Record<PackId, PackDefinition>> = PACKS.reduce(
  (acc, pack) => {
    acc[pack.id] = pack;
    return acc;
  },
  {} as Record<PackId, PackDefinition>
);

const LEGACY_PACK_ID_MAP: Readonly<Record<string, PackId>> = {
  marketplace: "marketplace_sale",
};

function normalizePackId(raw: string): string {
  const v = raw.trim().toLowerCase().slice(0, MAX_PACK_ID_INPUT_LEN);
  return LEGACY_PACK_ID_MAP[v] ?? v;
}

function normalizePlanTier(planId: string | null | undefined): PackTier {
  const v = String(planId || "").trim().toLowerCase();
  return v === "free" ? "free" : "pro";
}

export function isPackId(value: string): value is PackId {
  const v = String(value || "").trim().toLowerCase().slice(0, MAX_PACK_ID_INPUT_LEN);
  return Object.prototype.hasOwnProperty.call(PACK_BY_ID, v);
}

export function getPackById(packId: string | null | undefined): PackDefinition {
  const raw = normalizePackId(String(packId || ""));
  if (Object.prototype.hasOwnProperty.call(PACK_BY_ID, raw)) {
    return PACK_BY_ID[raw as PackId];
  }
  return PACK_BY_ID[DEFAULT_PACK_ID];
}

export function isPackAvailableForPlan(
  packIdOrPack: string | PackDefinition,
  planId: string | null | undefined
): boolean {
  const pack = typeof packIdOrPack === "string" ? getPackById(packIdOrPack) : packIdOrPack;
  if (pack.minPlan === "free") return true;
  return normalizePlanTier(planId) === "pro";
}

export function applyPack(
  baseConfig: ShareSettings,
  packId: string | null | undefined,
  nowMs: number = Date.now()
): ShareSettings {
  const pack = getPackById(packId);
  const settings = pack.settings;
  const next: ShareSettings = { ...baseConfig };

  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();

  if (settings.expiresInSeconds !== undefined && settings.expiresInSeconds !== null) {
    const seconds = Math.max(0, Math.min(MAX_EXPIRES_IN_SECONDS, Math.floor(settings.expiresInSeconds)));
    next.expiresInSeconds = seconds;
    next.expiresAt = new Date(safeNowMs + seconds * 1000).toISOString();
  } else if (settings.expiresAt !== undefined) {
    const expiresAt = String(settings.expiresAt || "").trim();
    const parsed = Date.parse(expiresAt);
    next.expiresAt = Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
    next.expiresInSeconds = null;
  }

  if (settings.watermarkEnabled !== undefined) next.watermarkEnabled = Boolean(settings.watermarkEnabled);
  if (settings.allowDownload !== undefined) next.allowDownload = Boolean(settings.allowDownload);
  if (settings.maxViews !== undefined) {
    if (settings.maxViews == null) {
      next.maxViews = null;
    } else {
      next.maxViews = Math.max(1, Math.min(MAX_MAX_VIEWS, Math.floor(settings.maxViews)));
    }
  }
  if (settings.collectRecipient !== undefined) next.collectRecipient = Boolean(settings.collectRecipient);
  if (settings.requireEmail !== undefined) next.requireEmail = Boolean(settings.requireEmail);
  if (settings.requireOtp !== undefined) next.requireOtp = Boolean(settings.requireOtp);
  if (settings.passwordRequired !== undefined) next.passwordRequired = Boolean(settings.passwordRequired);
  if (settings.passwordMode !== undefined) {
    next.passwordMode = settings.passwordMode === "generated" || settings.passwordMode === "user"
      ? settings.passwordMode
      : null;
  }

  return next;
}
