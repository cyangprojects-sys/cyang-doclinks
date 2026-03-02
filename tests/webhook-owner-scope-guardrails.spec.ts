import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("webhook owner scoping guardrails", () => {
  test("webhook listing query is owner-scoped", () => {
    const code = readFileSync("src/lib/webhooks.ts", "utf8");
    expect(code.includes("and owner_id = ${ownerId}::uuid")).toBeTruthy();
  });

  test("emitWebhook fails closed when owner cannot be resolved", () => {
    const code = readFileSync("src/lib/webhooks.ts", "utf8");
    expect(code.includes("const ownerId = await resolveWebhookOwnerId(payload);")).toBeTruthy();
    expect(code.includes("if (!ownerId) return;")).toBeTruthy();
  });
});
