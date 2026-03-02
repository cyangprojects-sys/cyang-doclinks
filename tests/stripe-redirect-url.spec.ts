import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { safeStripeRedirectUrl } from "../src/lib/stripeClient";

test.describe("stripe redirect url guardrails", () => {
  test("allows only https stripe.com hosted urls", () => {
    expect(safeStripeRedirectUrl("https://checkout.stripe.com/c/pay/cs_test_123")).toContain("checkout.stripe.com");
    expect(safeStripeRedirectUrl("https://billing.stripe.com/p/session/test")).toContain("billing.stripe.com");
  });

  test("rejects non-https and non-stripe hosts", () => {
    expect(() => safeStripeRedirectUrl("http://checkout.stripe.com/c/pay/cs_test_123")).toThrow(
      "Stripe redirect URL host is not allowed"
    );
    expect(() => safeStripeRedirectUrl("https://example.com/pay")).toThrow("Stripe redirect URL host is not allowed");
    expect(() => safeStripeRedirectUrl("javascript:alert(1)")).toThrow("Stripe redirect URL host is not allowed");
    expect(() => safeStripeRedirectUrl("not a url")).toThrow("Stripe redirect URL is invalid");
  });

  test("checkout and portal routes validate stripe redirect urls", () => {
    const files = [
      "src/app/api/billing/checkout/route.ts",
      "src/app/api/admin/billing/checkout/route.ts",
      "src/app/api/admin/billing/portal/route.ts",
    ];

    for (const file of files) {
      const code = readFileSync(file, "utf8");
      expect(code.includes("safeStripeRedirectUrl(")).toBeTruthy();
    }
  });
});
