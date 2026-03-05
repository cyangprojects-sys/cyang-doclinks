import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("api v1 abuse report guardrails", () => {
  test("abuse report route guards decode failures and payload bounds", () => {
    const code = readFileSync("src/app/api/v1/abuse/report/route.ts", "utf8");
    expect(code.includes("MAX_ABUSE_REPORT_BODY_BYTES")).toBeTruthy();
    expect(code.includes("decodeURIComponent")).toBeTruthy();
    expect(code.includes("catch")).toBeTruthy();
    expect(code.includes("PAYLOAD_TOO_LARGE")).toBeTruthy();
    expect(code.includes("MAX_REPORT_MESSAGE_LEN")).toBeTruthy();
  });
});
