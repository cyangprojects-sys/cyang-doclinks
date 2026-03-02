import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

function trackedFiles(): string[] {
  const raw = execSync("git ls-files --cached", { encoding: "utf8" });
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((f) => !f.startsWith("tests/"))
    .filter((f) => !f.startsWith("scripts/"))
    .filter((f) => !f.startsWith("docs/"))
    .filter((f) => !f.startsWith(".github/"))
    .filter((f) => !f.endsWith(".png") && !f.endsWith(".jpg") && !f.endsWith(".pdf"));
}

test.describe("repo secrets audit", () => {
  test("tracked source/config files do not include obvious live credentials", () => {
    const files = trackedFiles();
    const findings: Array<{ file: string; token: string }> = [];
    const patterns: Array<{ name: string; re: RegExp }> = [
      { name: "stripe_live_secret", re: /\bsk_live_[0-9A-Za-z]{16,}\b/ },
      { name: "stripe_live_restricted", re: /\brk_live_[0-9A-Za-z]{16,}\b/ },
      { name: "aws_access_key", re: /\bAKIA[0-9A-Z]{16}\b/ },
      { name: "private_key_block", re: /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/ },
      { name: "github_pat", re: /\bghp_[0-9A-Za-z]{30,}\b/ },
      { name: "npm_token", re: /\bnpm_[0-9A-Za-z]{32,}\b/ },
    ];

    for (const file of files) {
      if (!existsSync(file)) continue;
      const code = readFileSync(file, "utf8");
      for (const { name, re } of patterns) {
        if (re.test(code)) findings.push({ file, token: name });
      }
    }

    expect(findings).toEqual([]);
  });
});
