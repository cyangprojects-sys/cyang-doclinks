import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

function actionFiles(): string[] {
  const raw = execSync('rg --files src/app | rg "(actions\\.ts|unlockActions\\.ts)$"', { encoding: "utf8" });
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

test.describe("server actions guardrails", () => {
  test('every "use server" action file has explicit auth or abuse controls', () => {
    const files = actionFiles();
    const findings: string[] = [];
    const guardTokens = [
      "requireUser(",
      "requireRole(",
      "requireDocWrite(",
      "getAuthedUser(",
      "rateLimit(",
      "bcrypt.compare(",
    ];

    for (const f of files) {
      const code = readFileSync(f, "utf8");
      if (!code.includes('"use server"')) continue;
      if (!guardTokens.some((t) => code.includes(t))) {
        findings.push(f);
      }
    }

    expect(findings).toEqual([]);
  });
});
