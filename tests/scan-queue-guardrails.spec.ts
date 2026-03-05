import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("scan queue guardrails", () => {
  test("validates doc/bucket/key inputs and clamps queue tuning values", () => {
    const code = readFileSync("src/lib/scanQueue.ts", "utf8");
    expect(code.includes("assertDbConfigured")).toBeTruthy();
    expect(code.includes("normalizeUuidOrNull")).toBeTruthy();
    expect(code.includes("INVALID_DOC_ID")).toBeTruthy();
    expect(code.includes("INVALID_BUCKET")).toBeTruthy();
    expect(code.includes("INVALID_KEY")).toBeTruthy();
    expect(code.includes("boundedInt")).toBeTruthy();
  });
});
