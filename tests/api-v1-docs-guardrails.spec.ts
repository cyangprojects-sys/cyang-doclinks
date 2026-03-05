import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("api v1 docs guardrails", () => {
  test("docs listing route enforces query limit bounds and timeout handling", () => {
    const code = readFileSync("src/app/api/v1/docs/route.ts", "utf8");
    expect(code.includes("parseDocsLimit(")).toBeTruthy();
    expect(code.includes("DOCS_LIMIT_MAX")).toBeTruthy();
    expect(code.includes("withRouteTimeout(")).toBeTruthy();
    expect(code.includes("isRouteTimeoutError")).toBeTruthy();
    expect(code.includes("error: \"TIMEOUT\"")).toBeTruthy();
  });
});
