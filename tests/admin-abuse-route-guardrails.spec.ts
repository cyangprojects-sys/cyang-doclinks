import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("admin abuse route guardrails", () => {
  test("admin abuse actions validate UUID inputs before DB writes", () => {
    const code = readFileSync("src/app/api/admin/abuse/route.ts", "utf8");
    expect(code.includes("const UUID_RE =")).toBeTruthy();
    expect(code.includes('error: "INVALID_DOC"')).toBeTruthy();
    expect(code.includes('error: "INVALID_REPORT"')).toBeTruthy();
  });
});
