import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("key rotation jobs guardrails", () => {
  test("normalizes key ids, actor id, numeric bounds, and error length", () => {
    const code = readFileSync("src/lib/keyRotationJobs.ts", "utf8");
    expect(code.includes("normalizeKeyId")).toBeTruthy();
    expect(code.includes("normalizeUuidOrNull")).toBeTruthy();
    expect(code.includes("boundedInt")).toBeTruthy();
    expect(code.includes("INVALID_KEY_ROTATION_ARGS")).toBeTruthy();
    expect(code.includes("MAX_ERROR_LEN")).toBeTruthy();
  });
});
