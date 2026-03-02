import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("api v1 webhook test guardrails", () => {
  test("webhook test route does not expose raw queue exceptions", () => {
    const code = readFileSync("src/app/api/v1/webhooks/test/route.ts", "utf8");
    expect(code.includes("details: e instanceof Error ? e.message : String(e || \"failed\")")).toBeFalsy();
    expect(code.includes("error: \"DELIVERY_QUEUE_UNAVAILABLE\"")).toBeTruthy();
    expect(code.includes("logSecurityEvent({")).toBeTruthy();
  });
});
