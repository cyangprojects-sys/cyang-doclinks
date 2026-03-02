import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

function listSourceFiles(): string[] {
  const raw = execSync("rg --files src", { encoding: "utf8" });
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx|js|jsx)$/.test(f));
}

test.describe("security static audit", () => {
  test("no dangerous dynamic code execution sinks are present", () => {
    const files = listSourceFiles();
    const findings: Array<{ file: string; token: string }> = [];
    const deny = ["eval(", "new Function(", "child_process.exec(", "child_process.execSync("];

    for (const rel of files) {
      const abs = path.resolve(rel);
      const src = readFileSync(abs, "utf8");
      for (const token of deny) {
        if (src.includes(token)) findings.push({ file: rel, token });
      }
    }

    expect(findings).toEqual([]);
  });

  test("no secrets-like hardcoded keys are committed in source", () => {
    const files = listSourceFiles();
    const findings: Array<{ file: string; token: string }> = [];
    const denyRegexes: Array<{ name: string; re: RegExp }> = [
      { name: "stripe_secret", re: /\bsk_(live|test)_[0-9A-Za-z]{16,}\b/ },
      { name: "aws_access_key", re: /\bAKIA[0-9A-Z]{16}\b/ },
      { name: "private_key_block", re: /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/ },
      { name: "gh_pat", re: /\bghp_[0-9A-Za-z]{30,}\b/ },
    ];

    for (const rel of files) {
      const abs = path.resolve(rel);
      const src = readFileSync(abs, "utf8");
      for (const { name, re } of denyRegexes) {
        if (re.test(src)) findings.push({ file: rel, token: name });
      }
    }

    expect(findings).toEqual([]);
  });
});
