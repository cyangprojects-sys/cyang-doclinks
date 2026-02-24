// src/lib/billingFlags.ts
// Centralized feature flags for monetization / pricing.

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v == null) return fallback;
  const s = String(v).trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes" || s === "y" || s === "on") return true;
  if (s === "0" || s === "false" || s === "no" || s === "n" || s === "off") return false;
  return fallback;
}

/**
 * Hard enforcement of plan limits.
 *
 * Default: ON (so Free limits are actually enforced).
 * Set ENFORCE_PLAN_LIMITS=0 to disable in a dev environment.
 */
export function enforcePlanLimitsEnabled(): boolean {
  return envBool("ENFORCE_PLAN_LIMITS", true);
}

/**
 * Whether the Pro plan (unlimited) should actually be honored.
 *
 * Default: OFF. This prevents accidentally granting unlimited usage before you ship pricing.
 * Set PRO_PLAN_ENABLED=1 to honor users.plan_id='pro'.
 */
export function proPlanEnabled(): boolean {
  return envBool("PRO_PLAN_ENABLED", false);
}

/**
 * Whether pricing/upgrade UI should be visible.
 *
 * Default: OFF (hidden pricing).
 * Set PRICING_UI_ENABLED=1 to show upgrade links / pricing pages.
 */
export function pricingUiEnabled(): boolean {
  return envBool("PRICING_UI_ENABLED", false);
}
