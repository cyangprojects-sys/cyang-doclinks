import { expect, test } from "@playwright/test";
import { analyzeEnvExample, collectStaticEnvRefs } from "../scripts/lib/env-example-audit.mjs";

test.describe("env example audit", () => {
  test("captures shared env helper patterns used across the repo", () => {
    const refs = collectStaticEnvRefs(`
      const a = readEnvInt("ROUTE_TIMEOUT_UPLOAD_COMPLETE_MS", 45000);
      const b = readPreferredEnvText("SUPPORT_EMAIL", ["CONTACT_EMAIL"]);
      const c = readPreferredEnvBoolean(["CF_PAGES", "CF_WORKER"], false);
      const d = mustEnv("EMAIL_FROM");
      const e = env.R2_ALLOWED_BUCKETS;
      const f = parseBooleanEnv("OIDC_REQUIRE_EMAIL_VERIFIED", true);
      const g = truthyEnv("TRUST_PROXY_HEADERS");
    `);

    expect([...refs].sort()).toEqual([
      "CF_PAGES",
      "CF_WORKER",
      "CONTACT_EMAIL",
      "EMAIL_FROM",
      "OIDC_REQUIRE_EMAIL_VERIFIED",
      "R2_ALLOWED_BUCKETS",
      "ROUTE_TIMEOUT_UPLOAD_COMPLETE_MS",
      "SUPPORT_EMAIL",
      "TRUST_PROXY_HEADERS",
    ]);
  });

  test("accepts only documented intentional extras in .env.example", () => {
    const report = analyzeEnvExample(process.cwd());
    expect(report.missing).toEqual([]);
    expect(report.unexpectedExtra).toEqual([]);
    expect(report.intentionalExtra).toContain("ADMIN_PASSWORD");
    expect(report.intentionalExtra).toContain("AUTH_SECRET");
  });
});
