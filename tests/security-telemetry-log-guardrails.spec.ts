import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("security telemetry log guardrails", () => {
  test("security telemetry uses redacted failure logs", () => {
    const code = readFileSync("src/lib/securityTelemetry.ts", "utf8");
    expect(code.includes("console.error(\"Failed to log security event:\"")).toBeFalsy();
    expect(code.includes("console.error(\"Failed to log decrypt event:\"")).toBeFalsy();
    expect(code.includes("logTelemetryFailure(\"Failed to log security event.\")")).toBeTruthy();
    expect(code.includes("logTelemetryFailure(\"Failed to log decrypt event.\")")).toBeTruthy();
  });
});
