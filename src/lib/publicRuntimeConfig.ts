import { pricingUiEnabled } from "@/lib/billingFlags";
import { readPreferredEnvBoolean, readPreferredEnvText } from "@/lib/envConfig";
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

function publicSignupEnabled(): boolean {
  return readPreferredEnvBoolean(["NEXT_PUBLIC_SIGNUP_ENABLED", "SIGNUP_ENABLED"], true);
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
    legalEmail: normalizeEmail(readPreferredEnvText("LEGAL_EMAIL") || "", "legal@cyang.io"),
  };

  return cachedPublicRuntimeConfig;
}
