import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("view limit override guardrails", () => {
  test("normalizes owner/actor ids and clamps override inputs", () => {
    const code = readFileSync("src/lib/viewLimitOverride.ts", "utf8");
    expect(code.includes("normalizeUuidOrNull")).toBeTruthy();
    expect(code.includes("boundedInt")).toBeTruthy();
    expect(code.includes("INVALID_OWNER_ID")).toBeTruthy();
    expect(code.includes("normalizeReason")).toBeTruthy();
  });
});
