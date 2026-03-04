import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("platform security config guardrails", () => {
  test("next.config defines strict global security headers", () => {
    const code = readFileSync("next.config.ts", "utf8");
    expect(code.includes('"X-Content-Type-Options"')).toBeTruthy();
    expect(code.includes('"X-Frame-Options"')).toBeTruthy();
    expect(code.includes('"Referrer-Policy"')).toBeTruthy();
    expect(code.includes('"Permissions-Policy"')).toBeTruthy();
    expect(code.includes('"Content-Security-Policy"')).toBeTruthy();
    expect(code.includes('"Strict-Transport-Security"')).toBeTruthy();
  });

  test("viewer surfaces use SAMEORIGIN framing while other routes are DENY", () => {
    const code = readFileSync("next.config.ts", "utf8");
    expect(code.includes('source: "/serve/:path*"')).toBeTruthy();
    expect(code.includes('source: "/d/:path*"')).toBeTruthy();
    expect(code.includes('source: "/t/:path*"')).toBeTruthy();
    expect(code.includes('value: "SAMEORIGIN"')).toBeTruthy();
    expect(code.includes('source: "/((?!serve|d|t).*)"')).toBeTruthy();
    expect(code.includes('value: "DENY"')).toBeTruthy();
  });

  test("CSP connect-src env tokens are sanitized to prevent directive injection", () => {
    const code = readFileSync("next.config.ts", "utf8");
    expect(code.includes("normalizeConnectSourceToken")).toBeTruthy();
    expect(code.includes("/['\"`;]/")).toBeTruthy();
    expect(code.includes("schemeHostSourcePattern")).toBeTruthy();
    expect(code.includes("hostSourcePattern")).toBeTruthy();
  });
});
