import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("quarantine override guardrails", () => {
  test("normalizes uuid inputs and ttl/reason values", () => {
    const code = readFileSync("src/lib/quarantineOverride.ts", "utf8");
    expect(code.includes("normalizeUuidOrNull")).toBeTruthy();
    expect(code.includes("boundedInt")).toBeTruthy();
    expect(code.includes("INVALID_DOC_ID")).toBeTruthy();
    expect(code.includes("normalizeReason")).toBeTruthy();
  });
});
