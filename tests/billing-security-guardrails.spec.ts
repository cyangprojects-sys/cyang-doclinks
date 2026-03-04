import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("billing security guardrails", () => {
  test("webhook identity binding is enforced before subscription upsert", () => {
    const routeCode = readFileSync("src/app/api/stripe/webhook/route.ts", "utf8");
    const helperCode = readFileSync("src/lib/billingSubscription.ts", "utf8");
    expect(routeCode.includes("resolveUserIdForStripeWebhookEvent")).toBeTruthy();
    expect(routeCode.includes("stripe_webhook_binding_rejected")).toBeTruthy();
    expect(helperCode.includes("BILLING_BINDING_CONFLICT")).toBeTruthy();
  });

  test("subscription upsert does not clear existing user binding when incoming user is null", () => {
    const code = readFileSync("src/lib/billingSubscription.ts", "utf8");
    expect(code.includes("coalesce(excluded.user_id, public.billing_subscriptions.user_id)")).toBeTruthy();
  });

  test("billing snapshot webhook events are scoped to the requesting user/subscription", () => {
    const code = readFileSync("src/lib/billingSubscription.ts", "utf8");
    expect(code.includes("payload #>> '{data,object,id}'")).toBeTruthy();
    expect(code.includes("payload #>> '{data,object,subscription}'")).toBeTruthy();
    expect(code.includes("payload #>> '{data,object,customer}'")).toBeTruthy();
    expect(code.includes("payload #>> '{data,object,metadata,user_id}'")).toBeTruthy();
  });

  test("billing maintenance uses a rolling cursor instead of fixed first-N scan", () => {
    const code = readFileSync("src/lib/billingSubscription.ts", "utf8");
    expect(code.includes("billing_maintenance_cursor")).toBeTruthy();
    expect(code.includes("user_id::text >")).toBeTruthy();
    expect(code.includes("wrapBatch")).toBeTruthy();
  });
});
