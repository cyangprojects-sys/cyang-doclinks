import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("admin dmca route guardrails", () => {
  test("dmca admin route validates action, ids, and payload size", () => {
    const code = readFileSync("src/app/api/admin/dmca/route.ts", "utf8");
    expect(code.includes("MAX_DMCA_BODY_BYTES")).toBeTruthy();
    expect(code.includes("INVALID_NOTICE_ID")).toBeTruthy();
    expect(code.includes("INVALID_DOC_ID")).toBeTruthy();
    expect(code.includes("INVALID_STATUS")).toBeTruthy();
    expect(code.includes("CONFIRMATION_REQUIRED")).toBeTruthy();
  });
});
