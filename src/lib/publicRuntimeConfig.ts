import { pricingUiEnabled } from "@/lib/billingFlags";
import { getPrivacyEmail, getSecurityEmail, getSupportEmail } from "@/lib/legal";

export type PublicRuntimeConfig = {
  showPricingUi: boolean;
  signupEnabled: boolean;
  supportEmail: string;
  securityEmail: string;
  privacyEmail: string;
  legalEmail: string;
};

let cachedPublicRuntimeConfig: PublicRuntimeConfig | null = null;

function parseBooleanEnv(raw: string | undefined | null, fallback: boolean): boolean {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function publicSignupEnabled(): boolean {
  return parseBooleanEnv(process.env.NEXT_PUBLIC_SIGNUP_ENABLED ?? process.env.SIGNUP_ENABLED, true);
}

function normalizeEmail(value: string, fallback: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || /[\r\n\0]/.test(normalized)) return fallback;
  return normalized;
}

export function getPublicRuntimeConfig(): PublicRuntimeConfig {
  if (cachedPublicRuntimeConfig) return cachedPublicRuntimeConfig;

  cachedPublicRuntimeConfig = {
    showPricingUi: pricingUiEnabled(),
    signupEnabled: publicSignupEnabled(),
    supportEmail: getSupportEmail(),
    securityEmail: getSecurityEmail(),
    privacyEmail: getPrivacyEmail(),
    legalEmail: normalizeEmail(process.env.LEGAL_EMAIL || "", "legal@cyang.io"),
  };

  return cachedPublicRuntimeConfig;
}
