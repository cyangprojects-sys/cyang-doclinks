import { expect, test } from "@playwright/test";
import {
  classifyBillingEntitlement,
  getBillingSnapshotForUser,
  syncUserPlanFromSubscription,
  type BillingSubscriptionSnapshot,
  unixToIso,
} from "../src/lib/billingSubscription";

function sub(overrides?: Partial<Exclude<BillingSubscriptionSnapshot, null>>): Exclude<BillingSubscriptionSnapshot, null> {
  return {
    stripeSubscriptionId: "sub_123",
    stripeCustomerId: "cus_123",
    status: "active",
    planId: "pro",
    currentPeriodEnd: new Date(Date.now() + 60_000).toISOString(),
    cancelAtPeriodEnd: false,
    graceUntil: null,
    updatedAt: new Date().toISOString(),
    ...(overrides || {}),
  };
}

test.describe("billing subscription helper primitives", () => {
  test("unixToIso validates and converts unix timestamps", () => {
    expect(unixToIso(0)).toBeNull();
    expect(unixToIso(-1)).toBeNull();
    expect(unixToIso("not-a-number")).toBeNull();
    expect(unixToIso(1)).toBe("1970-01-01T00:00:01.000Z");
  });

  test("classifyBillingEntitlement handles canonical states", () => {
    expect(classifyBillingEntitlement(null)).toBe("none");
    expect(classifyBillingEntitlement(sub({ status: "active" }))).toBe("active");
    expect(classifyBillingEntitlement(sub({ status: "trialing" }))).toBe("active");
    expect(
      classifyBillingEntitlement(sub({ status: "past_due", graceUntil: new Date(Date.now() + 60_000).toISOString() }))
    ).toBe("grace");
    expect(classifyBillingEntitlement(sub({ status: "unpaid" }))).toBe("at_risk");
    expect(classifyBillingEntitlement(sub({ status: "incomplete" }))).toBe("at_risk");
    expect(classifyBillingEntitlement(sub({ status: "canceled" }))).toBe("downgraded");
    expect(classifyBillingEntitlement(sub({ status: "grace_expired" }))).toBe("downgraded");
  });

  test("classifyBillingEntitlement fails closed for expired/unknown states", () => {
    const expiredActive = sub({
      status: "active",
      currentPeriodEnd: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(classifyBillingEntitlement(expiredActive)).toBe("at_risk");

    expect(classifyBillingEntitlement(sub({ status: "mystery_status" }))).toBe("at_risk");
  });

  test("helpers fail closed on invalid user ids before db lookups", async () => {
    await expect(syncUserPlanFromSubscription("not-a-uuid")).resolves.toBeNull();
    await expect(getBillingSnapshotForUser("not-a-uuid")).resolves.toEqual({
      subscription: null,
      events: [],
    });
  });
});
