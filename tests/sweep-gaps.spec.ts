import { expect, test } from "@playwright/test";
import { normalizeExpiresAtForPlan, normalizeMaxViewsForPlan, type Plan } from "../src/lib/monetization";
import { resolveDoc, resolveShareMeta, consumeShareTokenView } from "../src/lib/resolveDoc";
import { sendSignInEmail } from "../src/lib/resend";
import { getBillingFlags, getSecurityFreezeSettings } from "../src/lib/settings";
import { stripeApi, ensureStripeCustomer } from "../src/lib/stripeClient";
import {
  listRolePermissionOverrides,
  upsertRolePermissionOverride,
  userHasPermission,
  type Permission,
} from "../src/lib/rbac";
import {
  getActiveViewLimitOverride,
  hasActiveViewLimitOverride,
  setViewLimitOverride,
} from "../src/lib/viewLimitOverride";
import { emitWebhook, processWebhookDeliveries } from "../src/lib/webhooks";
import { enqueueDocScan, healScanQueue } from "../src/lib/scanQueue";
import { runUsageMaintenance } from "../src/lib/usageMaintenance";

const BASE_ENV = {
  DATABASE_URL: process.env.DATABASE_URL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  ENFORCE_PLAN_LIMITS: process.env.ENFORCE_PLAN_LIMITS,
  PRO_PLAN_ENABLED: process.env.PRO_PLAN_ENABLED,
  PRICING_UI_ENABLED: process.env.PRICING_UI_ENABLED,
};

test.afterEach(() => {
  process.env.DATABASE_URL = BASE_ENV.DATABASE_URL;
  process.env.RESEND_API_KEY = BASE_ENV.RESEND_API_KEY;
  process.env.EMAIL_FROM = BASE_ENV.EMAIL_FROM;
  process.env.STRIPE_SECRET_KEY = BASE_ENV.STRIPE_SECRET_KEY;
  process.env.ENFORCE_PLAN_LIMITS = BASE_ENV.ENFORCE_PLAN_LIMITS;
  process.env.PRO_PLAN_ENABLED = BASE_ENV.PRO_PLAN_ENABLED;
  process.env.PRICING_UI_ENABLED = BASE_ENV.PRICING_UI_ENABLED;
});

test.describe("gap sweep fallback behavior", () => {
  test("monetization normalizers enforce free-tier invariants", () => {
    const free: Plan = {
      id: "free",
      name: "Free",
      maxViewsPerMonth: 100,
      maxActiveShares: 3,
      maxStorageBytes: 1,
      maxUploadsPerDay: 1,
      maxFileSizeBytes: 1,
      allowCustomExpiration: false,
      allowAuditExport: false,
      allowAdvancedAnalytics: false,
    };

    const req = normalizeExpiresAtForPlan({
      plan: free,
      requestedExpiresAtIso: "2099-01-01T00:00:00.000Z",
      defaultDaysIfNotAllowed: 999,
    });
    expect(req).not.toBeNull();
    const reqTime = Date.parse(String(req));
    const maxWindow = Date.now() + 7 * 24 * 60 * 60 * 1000 + 2000;
    expect(reqTime <= maxWindow).toBeTruthy();

    expect(normalizeMaxViewsForPlan({ plan: free, requestedMaxViews: null })).toBeGreaterThan(0);
    expect(normalizeMaxViewsForPlan({ plan: free, requestedMaxViews: 5000 })).toBe(100);
  });

  test("resolve helpers fail closed for blank identifiers", async () => {
    await expect(resolveShareMeta("")).resolves.toEqual({ ok: false });
    await expect(consumeShareTokenView("")).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    await expect(resolveDoc({ alias: "" })).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    await expect(resolveDoc({ token: "" })).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    await expect(resolveDoc({ docId: "" })).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
  });

  test("resend helper validates env and sends with expected payload", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_FROM = "DocLinks <login@cyang.io>";
    await expect(sendSignInEmail("user@example.com", "https://example.com/s/abc")).rejects.toThrow(
      /Missing env: RESEND_API_KEY/
    );

    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "DocLinks <login@cyang.io>";

    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response("", { status: 200 });
    }) as typeof fetch;

    try {
      await sendSignInEmail("user@example.com", "https://example.com/s/abc");
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://api.resend.com/emails");
      const authHeader = new Headers(calls[0].init?.headers).get("Authorization") || "";
      expect(authHeader).toContain("re_test_key");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("settings fall back to env/defaults when DB is unavailable", async () => {
    delete process.env.DATABASE_URL;
    process.env.ENFORCE_PLAN_LIMITS = "0";
    process.env.PRO_PLAN_ENABLED = "1";
    process.env.PRICING_UI_ENABLED = "yes";

    const billing = await getBillingFlags();
    expect(billing.flags.enforcePlanLimits).toBeFalsy();
    expect(billing.flags.proPlanEnabled).toBeTruthy();
    expect(billing.flags.pricingUiEnabled).toBeTruthy();

    const freeze = await getSecurityFreezeSettings();
    expect(freeze.settings.globalServeDisabled).toBeFalsy();
    expect(freeze.settings.shareServeDisabled).toBeFalsy();
  });

  test("stripe helper handles missing key, request formatting, and existing customer short-circuit", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    await expect(stripeApi("/customers", { method: "GET" })).rejects.toThrow(/STRIPE_SECRET_KEY is not configured/);

    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify({ id: "cus_123" }), { status: 200 });
    }) as typeof fetch;
    try {
      const out = await stripeApi("/customers", { method: "POST", body: { email: "a@b.com" } });
      expect(String(out.id)).toBe("cus_123");
      expect(requests[0].url).toContain("/v1/customers");
      expect(String(requests[0].init?.body || "")).toContain("email=a%40b.com");
    } finally {
      globalThis.fetch = originalFetch;
    }

    await expect(
      ensureStripeCustomer({
        userId: "u1",
        email: "a@b.com",
        existingCustomerId: "cus_existing",
      })
    ).resolves.toBe("cus_existing");
  });

  test("rbac defaults fail closed without override table", async () => {
    delete process.env.DATABASE_URL;
    const adminUser = { id: "u1", email: "a@b.com", role: "admin" as const, orgId: null, orgSlug: null };
    const viewerUser = { id: "u2", email: "v@b.com", role: "viewer" as const, orgId: null, orgSlug: null };

    await expect(userHasPermission(adminUser, "audit.export")).resolves.toBeTruthy();
    await expect(userHasPermission(viewerUser, "billing.manage")).resolves.toBeFalsy();
    await expect(listRolePermissionOverrides()).resolves.toEqual([]);
    await expect(
      upsertRolePermissionOverride({
        permission: "security.keys.manage" as Permission,
        role: "owner",
        allowed: true,
      })
    ).rejects.toThrow(/RBAC_TABLE_MISSING/);
  });

  test("override/webhook/queue maintenance helpers fail closed without DB", async () => {
    delete process.env.DATABASE_URL;
    await expect(getActiveViewLimitOverride("")).resolves.toBeNull();
    await expect(hasActiveViewLimitOverride("")).resolves.toBeFalsy();
    await expect(
      setViewLimitOverride({ ownerId: "x", actorUserId: null, hours: 12, reason: "test" })
    ).rejects.toThrow(/MISSING_VIEW_LIMIT_OVERRIDE_TABLE/);

    await expect(emitWebhook("webhook.test", { ok: true })).resolves.toBeUndefined();
    await expect(processWebhookDeliveries()).resolves.toMatchObject({ ok: false });

    await expect(enqueueDocScan({ docId: "x", bucket: "b", key: "k" })).rejects.toThrow(/Missing DATABASE_URL/);
    await expect(healScanQueue()).rejects.toThrow(/Missing DATABASE_URL/);
    await expect(runUsageMaintenance()).rejects.toThrow(/Missing DATABASE_URL/);
  });
});
