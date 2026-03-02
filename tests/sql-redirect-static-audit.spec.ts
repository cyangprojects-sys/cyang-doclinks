import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

function sourceFiles(): string[] {
  const raw = execSync("rg --files src", { encoding: "utf8" });
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx|js|jsx)$/.test(f));
}

test.describe("sql and redirect static audit", () => {
  test("no string-built sql() calls are present", () => {
    const files = sourceFiles();
    const findings: Array<{ file: string; token: string }> = [];
    const badSqlCall = /\bsql\s*\(\s*([`'"])/g;

    for (const file of files) {
      const code = readFileSync(file, "utf8");
      if (badSqlCall.test(code)) findings.push({ file, token: "sql(string_call)" });
    }

    expect(findings).toEqual([]);
  });

  test("no query-parameter based open redirects are introduced", () => {
    const files = sourceFiles();
    const findings: Array<{ file: string; token: string }> = [];
    const badRedirectPatterns = [
      /redirect\(\s*new URL\(\s*[^,]*searchParams\.get[^,]*,/g,
      /NextResponse\.redirect\(\s*new URL\(\s*[^,]*searchParams\.get[^,]*,/g,
    ];

    for (const file of files) {
      const code = readFileSync(file, "utf8");
      for (const re of badRedirectPatterns) {
        if (re.test(code)) findings.push({ file, token: "open_redirect_pattern" });
      }
    }

    expect(findings).toEqual([]);
  });
});
