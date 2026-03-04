export type PackId =
  | "general_secure_link"
  | "job_search"
  | "rental"
  | "marketplace";

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
  label: string;
  description: string;
  settings: ShareSettingsPatch;
  recommendedFor?: string[];
};

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
    label: "General Secure Link",
    description: "Default balanced settings for most secure shares.",
    settings: {},
    recommendedFor: ["General use"],
  },
  {
    id: "job_search",
    version: 1,
    label: "Job Search Pack",
    description: "Longer expiry and clean presentation for portfolio sharing.",
    settings: {
      expiresInSeconds: 30 * 24 * 60 * 60,
      watermarkEnabled: false,
      allowDownload: true,
    },
    recommendedFor: ["Portfolio", "Recruiters"],
  },
  {
    id: "rental",
    version: 1,
    label: "Rental Pack",
    description: "Expires in 7 days, watermarked, view-only, with recipient prompt.",
    settings: {
      expiresInSeconds: 7 * 24 * 60 * 60,
      watermarkEnabled: true,
      allowDownload: false,
      collectRecipient: true,
    },
    recommendedFor: ["Leasing", "Property docs"],
  },
  {
    id: "marketplace",
    version: 1,
    label: "Marketplace Pack",
    description: "Expires in 3 days, watermarked, view-only, optimized for quick shares.",
    settings: {
      expiresInSeconds: 3 * 24 * 60 * 60,
      watermarkEnabled: true,
      allowDownload: false,
    },
    recommendedFor: ["Listings", "One-off sends"],
  },
];

const PACK_BY_ID: Readonly<Record<PackId, PackDefinition>> = PACKS.reduce(
  (acc, pack) => {
    acc[pack.id] = pack;
    return acc;
  },
  {} as Record<PackId, PackDefinition>
);

export function isPackId(value: string): value is PackId {
  return Object.prototype.hasOwnProperty.call(PACK_BY_ID, value);
}

export function getPackById(packId: string | null | undefined): PackDefinition {
  const raw = String(packId || "").trim();
  if (isPackId(raw)) return PACK_BY_ID[raw];
  return PACK_BY_ID[DEFAULT_PACK_ID];
}

export function applyPack(
  baseConfig: ShareSettings,
  packId: string | null | undefined,
  nowMs: number = Date.now()
): ShareSettings {
  const pack = getPackById(packId);
  const settings = pack.settings;
  const next: ShareSettings = { ...baseConfig };

  if (settings.expiresInSeconds !== undefined && settings.expiresInSeconds !== null) {
    const seconds = Math.max(0, Math.floor(settings.expiresInSeconds));
    next.expiresInSeconds = seconds;
    next.expiresAt = new Date(nowMs + seconds * 1000).toISOString();
  } else if (settings.expiresAt !== undefined) {
    next.expiresAt = settings.expiresAt;
    next.expiresInSeconds = null;
  }

  if (settings.watermarkEnabled !== undefined) next.watermarkEnabled = Boolean(settings.watermarkEnabled);
  if (settings.allowDownload !== undefined) next.allowDownload = Boolean(settings.allowDownload);
  if (settings.maxViews !== undefined) next.maxViews = settings.maxViews;
  if (settings.collectRecipient !== undefined) next.collectRecipient = Boolean(settings.collectRecipient);
  if (settings.requireEmail !== undefined) next.requireEmail = Boolean(settings.requireEmail);
  if (settings.requireOtp !== undefined) next.requireOtp = Boolean(settings.requireOtp);
  if (settings.passwordRequired !== undefined) next.passwordRequired = Boolean(settings.passwordRequired);
  if (settings.passwordMode !== undefined) next.passwordMode = settings.passwordMode;

  return next;
}
