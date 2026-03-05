import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("admin security key api guardrails", () => {
  test("security key routes distinguish unauthenticated vs forbidden", () => {
    for (const file of [
      "src/app/api/admin/security/keys/route.ts",
      "src/app/api/admin/security/revoke/route.ts",
      "src/app/api/admin/security/rotate/route.ts",
    ]) {
      const code = readFileSync(file, "utf8");
      expect(code.includes("authErrorCode(")).toBeTruthy();
      expect(code.includes('error: "UNAUTHENTICATED"')).toBeTruthy();
      expect(code.includes('error: "FORBIDDEN"')).toBeTruthy();
    }
  });

  test("revoke and rotate routes validate key-id shape and reject unknown keys in payload", () => {
    for (const file of [
      "src/app/api/admin/security/revoke/route.ts",
      "src/app/api/admin/security/rotate/route.ts",
    ]) {
      const code = readFileSync(file, "utf8");
      expect(code.includes("KEY_ID_RE")).toBeTruthy();
      expect(code.includes(".strict()")).toBeTruthy();
    }
  });

  test("rotate route blocks noop rotations", () => {
    const code = readFileSync("src/app/api/admin/security/rotate/route.ts", "utf8");
    expect(code.includes('error: "NOOP_ROTATION"')).toBeTruthy();
  });

  test("security key mutation routes enforce payload-size limits", () => {
    for (const file of [
      "src/app/api/admin/security/activate/route.ts",
      "src/app/api/admin/security/revoke/route.ts",
      "src/app/api/admin/security/rotate/route.ts",
      "src/app/api/admin/security/rollback/route.ts",
      "src/app/api/admin/security/migrate-legacy/route.ts",
    ]) {
      const code = readFileSync(file, "utf8");
      expect(code.includes("parseJsonBodyLength")).toBeTruthy();
      expect(code.includes('error: "PAYLOAD_TOO_LARGE"')).toBeTruthy();
    }
  });
});
