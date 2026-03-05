import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("stale admin action guardrails", () => {
  test("stale admin actions are default-off behind ADMIN_ENABLE_STALE_ACTIONS", () => {
    const code = readFileSync("src/app/admin/actions.ts", "utf8");
    expect(code.includes("ADMIN_ENABLE_STALE_ACTIONS")).toBeTruthy();
    expect(code.includes("assertStaleAdminActionEnabled")).toBeTruthy();
    expect(code.includes('assertStaleAdminActionEnabled("updateRetentionSettingsAction")')).toBeTruthy();
    expect(code.includes('assertStaleAdminActionEnabled("updateExpirationAlertSettingsAction")')).toBeTruthy();
    expect(code.includes('assertStaleAdminActionEnabled("sendExpirationAlertAction")')).toBeTruthy();
    expect(code.includes('assertStaleAdminActionEnabled("markAdminNotificationReadAction")')).toBeTruthy();
    expect(code.includes('assertStaleAdminActionEnabled("markAllAdminNotificationsReadAction")')).toBeTruthy();
  });
});
