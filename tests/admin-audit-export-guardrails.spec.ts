import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("admin audit export guardrails", () => {
  test("audit export route does not echo raw DB errors", () => {
    const code = readFileSync("src/app/api/admin/audit/export/route.ts", "utf8");
    expect(code.includes("Export failed: ${msg}")).toBeFalsy();
    expect(code.includes("err instanceof Error ? err.message : \"unknown error\"")).toBeFalsy();
    expect(code.includes("return new Response(\"Export failed.\", { status: 500 });")).toBeTruthy();
    expect(code.includes("const type = parseExportType(url.searchParams.get(\"type\"));")).toBeTruthy();
    expect(code.includes("if (msg === \"UNAUTHENTICATED\")")).toBeTruthy();
  });
});
