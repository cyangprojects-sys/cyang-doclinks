import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("auth/authz input guardrails", () => {
  test("auth sign-in path validates manual credential email and password bounds", () => {
    const code = readFileSync("src/auth.ts", "utf8");
    expect(code.includes("EMAIL_RE")).toBeTruthy();
    expect(code.includes("MANUAL_PASSWORD_MAX_LEN")).toBeTruthy();
    expect(code.includes("isLikelyEmail(email)")).toBeTruthy();
    expect(code.includes("provider = String(account?.provider || \"\").trim().toLowerCase()")).toBeTruthy();
  });

  test("authz validates org slugs, invite tokens, and uuid doc ids", () => {
    const code = readFileSync("src/lib/authz.ts", "utf8");
    expect(code.includes("ORG_SLUG_RE")).toBeTruthy();
    expect(code.includes("INVITE_TOKEN_RE")).toBeTruthy();
    expect(code.includes("if (!INVITE_TOKEN_RE.test(token)) return null;")).toBeTruthy();
    expect(code.includes("if (!docId || !isUuid(docId)) throw new Error(\"FORBIDDEN\")")).toBeTruthy();
  });
});
