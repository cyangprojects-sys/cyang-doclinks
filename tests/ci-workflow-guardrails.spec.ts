import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("ci workflow guardrails", () => {
  test("CI pipeline enforces lint, build, and security jobs", () => {
    const code = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(code.includes("build-lint-audit")).toBeTruthy();
    expect(code.includes("security-unit")).toBeTruthy();
    expect(code.includes("npm run lint")).toBeTruthy();
    expect(code.includes("npm run audit:env-example")).toBeTruthy();
    expect(code.includes("npm run build")).toBeTruthy();
    expect(code.includes("npx tsc --noEmit -p tsconfig.json")).toBeTruthy();
    expect(code.includes("npm run audit:admin-routes")).toBeTruthy();
    expect(code.includes("npm audit --omit=dev")).toBeTruthy();
    expect(code.includes("tests/client-ip-helpers.spec.ts")).toBeTruthy();
    expect(code.includes("tests/runtime-env.spec.ts")).toBeTruthy();
    expect(code.includes("tests/master-key-config.spec.ts")).toBeTruthy();
    expect(code.includes("npm run test:attack:ci")).toBeTruthy();
    expect(code.includes("npm run test:security:state:ci")).toBeTruthy();
    expect(code.includes("npm run test:security:freeze:ci")).toBeTruthy();
  });
});
