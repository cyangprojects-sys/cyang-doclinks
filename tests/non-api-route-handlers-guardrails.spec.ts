import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

function nonApiRouteFiles(): string[] {
  const raw = execSync('rg --files src/app | rg "route\\.ts$"', { encoding: "utf8" });
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((p) => !p.includes("/api/") && !p.includes("\\api\\"));
}

test.describe("non-api route handler guardrails", () => {
  test("every non-api route handler includes explicit security controls", () => {
    const files = nonApiRouteFiles();
    const findings: string[] = [];
    const guardTokens = [
      "enforceGlobalApiRateLimit(",
      "rateLimit(",
      "enforceIpAbuseBlock(",
      "consumeAccessTicket(",
      "consumeShareTokenView(",
      "assertCanServeView(",
      "requireRole(",
      "resolveShareMeta(",
      "resolveDoc(",
    ];

    for (const f of files) {
      const code = readFileSync(f, "utf8");
      if (!guardTokens.some((t) => code.includes(t))) {
        findings.push(f);
      }
    }

    expect(findings).toEqual([]);
  });
});
