import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("org membership guardrails", () => {
  test("normalizes IDs, role/email, and invite token input", () => {
    const code = readFileSync("src/lib/orgMembership.ts", "utf8");
    expect(code.includes("normalizeUuidOrNull")).toBeTruthy();
    expect(code.includes("normalizeRoleOrNull")).toBeTruthy();
    expect(code.includes("INVITE_TOKEN_RE")).toBeTruthy();
    expect(code.includes("MAX_INVITE_TOKEN_INPUT_LEN")).toBeTruthy();
    expect(code.includes("INVALID_MEMBERSHIP_ARGS")).toBeTruthy();
    expect(code.includes("INVALID_ORG_INVITE_ARGS")).toBeTruthy();
  });
});
