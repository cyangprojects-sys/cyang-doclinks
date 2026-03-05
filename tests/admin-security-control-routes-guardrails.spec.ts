import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("admin security control route guardrails", () => {
  test("freeze/rbac/tenant-freeze routes enforce payload-size checks", () => {
    for (const file of [
      "src/app/api/admin/security/freeze/route.ts",
      "src/app/api/admin/security/rbac/route.ts",
      "src/app/api/admin/security/tenant-freeze/route.ts",
    ]) {
      const code = readFileSync(file, "utf8");
      expect(code.includes("parseJsonBodyLength(")).toBeTruthy();
      expect(code.includes('error: "PAYLOAD_TOO_LARGE"')).toBeTruthy();
    }
  });

  test("requeue-scans route enforces payload-size checks", () => {
    const code = readFileSync("src/app/api/admin/security/requeue-scans/route.ts", "utf8");
    expect(code.includes("parseBodyLength(")).toBeTruthy();
    expect(code.includes('error=PAYLOAD_TOO_LARGE')).toBeTruthy();
  });
});
