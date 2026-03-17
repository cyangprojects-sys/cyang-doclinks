import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";

test.describe("stray surfaces removed", () => {
  test("dead UI files stay removed", () => {
    const removedFiles = [
      "src/app/admin/components/AdminHeader.tsx",
      "src/app/admin/dashboard/DashboardItemsTabs.tsx",
      "src/app/viewer/ViewerLinkLauncher.tsx",
      "src/app/viewer/ViewerSignOutButton.tsx",
    ];
    for (const file of removedFiles) {
      expect(existsSync(file)).toBeFalsy();
    }
  });

  test("stray debug and test-only endpoints stay removed", () => {
    const removedRoutes = [
      "src/app/api/debug/alias/[alias]/route.ts",
      "src/app/api/admin/debug/telemetry/route.ts",
      "src/app/api/v1/webhooks/test/route.ts",
    ];
    for (const route of removedRoutes) {
      expect(existsSync(route)).toBeFalsy();
    }
  });
});
