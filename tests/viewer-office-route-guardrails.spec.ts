import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("viewer office route guardrails", () => {
  test("office preview route enforces payload, mime, and timeout controls", () => {
    const code = readFileSync("src/app/api/viewer/office/route.ts", "utf8");
    expect(code.includes("MAX_VIEWER_OFFICE_BODY_BYTES")).toBeTruthy();
    expect(code.includes("isSupportedOfficeMime")).toBeTruthy();
    expect(code.includes("withRouteTimeout(")).toBeTruthy();
    expect(code.includes("isRouteTimeoutError")).toBeTruthy();
    expect(code.includes("error: \"TIMEOUT\"")).toBeTruthy();
  });
});
