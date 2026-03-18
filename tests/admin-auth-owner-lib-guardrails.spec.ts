import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";

test.describe("admin/auth/owner helper guardrails", () => {
  test("legacy admin/auth/owner compatibility shims stay removed", () => {
    for (const file of ["src/lib/admin.ts", "src/lib/auth.ts", "src/lib/owner.ts"]) {
      expect(existsSync(file)).toBeFalsy();
    }
  });
});
