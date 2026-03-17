// src/lib/billingFlags.ts
// Centralized feature flags for monetization / pricing.

import { readEnvBoolean } from "@/lib/envConfig";

/**
 * Hard enforcement of plan limits.
 *
 * Default: ON (so Free limits are actually enforced).
 * Set ENFORCE_PLAN_LIMITS=0 to disable in a dev environment.
 */
export function enforcePlanLimitsEnabled(): boolean {
  return readEnvBoolean("ENFORCE_PLAN_LIMITS", true);
}

/**
 * Whether the Pro plan (unlimited) should actually be honored.
 *
 * Default: OFF. This prevents accidentally granting unlimited usage before you ship pricing.
 * Set PRO_PLAN_ENABLED=1 to honor users.plan_id='pro'.
 */
export function proPlanEnabled(): boolean {
  return readEnvBoolean("PRO_PLAN_ENABLED", false);
}

/**
 * Whether pricing/upgrade UI should be visible.
 *
 * Default: OFF (hidden pricing).
 * Set PRICING_UI_ENABLED=1 to show upgrade links / pricing pages.
 */
export function pricingUiEnabled(): boolean {
  return readEnvBoolean("PRICING_UI_ENABLED", false);
}
