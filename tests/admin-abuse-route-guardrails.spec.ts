import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("admin abuse route guardrails", () => {
  test("admin abuse actions validate UUID inputs before DB writes", () => {
    const code = readFileSync("src/app/api/admin/abuse/route.ts", "utf8");
    expect(code.includes("const UUID_RE =")).toBeTruthy();
    expect(code.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
    expect(code.includes("strict: true")).toBeTruthy();
    expect(code.includes('error: "RATE_LIMIT"')).toBeTruthy();
    expect(code.includes('error: "INVALID_DOC"')).toBeTruthy();
    expect(code.includes('error: "INVALID_REPORT"')).toBeTruthy();
    expect(code.includes("MAX_ADMIN_ABUSE_BODY_BYTES")).toBeTruthy();
    expect(code.includes('error: "INVALID_TOKEN"')).toBeTruthy();
    expect(code.includes('"quarantine_doc"')).toBeFalsy();
  });
});
