import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("stale admin actions removed", () => {
  test("unused stale admin action exports are removed from admin actions module", () => {
    const code = readFileSync("src/app/admin/actions.ts", "utf8");
    const removedSymbols = [
      "uploadPdfAction",
      "updateRetentionSettingsAction",
      "updateExpirationAlertSettingsAction",
      "sendExpirationAlertAction",
      "markAdminNotificationReadAction",
      "markAllAdminNotificationsReadAction",
      "ADMIN_ENABLE_STALE_ACTIONS",
      "assertStaleAdminActionEnabled",
    ];
    for (const symbol of removedSymbols) {
      expect(code.includes(symbol)).toBeFalsy();
    }
  });
});
