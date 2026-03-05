import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { revokeExpiredSharesBatch } from "../src/lib/shareLifecycle";

test.describe("geo/expiration/shareLifecycle guardrails", () => {
  test("geo decision validates doc ids and share tokens", () => {
    const code = readFileSync("src/lib/geo.ts", "utf8");
    expect(code.includes("INVALID_DOC_ID")).toBeTruthy();
    expect(code.includes("INVALID_SHARE_TOKEN")).toBeTruthy();
    expect(code.includes("UUID_RE")).toBeTruthy();
  });

  test("expiration alerts sanitize errors and mask share tokens", () => {
    const code = readFileSync("src/lib/expirationAlerts.ts", "utf8");
    expect(code.includes("safeAlertError")).toBeTruthy();
    expect(code.includes("maskedToken")).toBeTruthy();
    expect(code.includes("base_url_unavailable")).toBeTruthy();
  });

  test("share lifecycle clamps invalid limits safely", async () => {
    await expect(revokeExpiredSharesBatch(Number.NaN)).resolves.toMatchObject({ revoked: expect.any(Number) });
    await expect(revokeExpiredSharesBatch(Number.POSITIVE_INFINITY)).resolves.toMatchObject({ revoked: expect.any(Number) });
  });
});
