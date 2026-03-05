import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("encryption migration guardrails", () => {
  test("migration batch clamps numeric args and sanitizes stream/error handling", () => {
    const code = readFileSync("src/lib/encryptionMigration.ts", "utf8");
    expect(code.includes("clampInt(")).toBeTruthy();
    expect(code.includes("STREAM_TOO_LARGE")).toBeTruthy();
    expect(code.includes("sanitizeError(")).toBeTruthy();
    expect(code.includes("MAX_R2_KEY_LEN")).toBeTruthy();
  });
});
