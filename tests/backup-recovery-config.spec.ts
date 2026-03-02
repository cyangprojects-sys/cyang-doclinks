import { expect, test } from "@playwright/test";
import { parseBackupRecoveryConfig } from "../src/lib/backupRecovery";

test.describe("backup recovery config parsing", () => {
  test("parses enabled flag and trims webhook", () => {
    const out = parseBackupRecoveryConfig({
      BACKUP_AUTOMATION_ENABLED: "YES",
      BACKUP_WEBHOOK_URL: "  https://example.test/hook  ",
    } as NodeJS.ProcessEnv);
    expect(out.enabled).toBeTruthy();
    expect(out.webhook).toBe("https://example.test/hook");
    expect(out.maxAgeHours).toBe(30);
    expect(out.recoveryDrillDays).toBe(30);
  });

  test("treats unknown enabled values as false", () => {
    const out = parseBackupRecoveryConfig({
      BACKUP_AUTOMATION_ENABLED: "garbage",
    } as NodeJS.ProcessEnv);
    expect(out.enabled).toBeFalsy();
  });

  test("clamps and falls back numeric values safely", () => {
    const invalid = parseBackupRecoveryConfig({
      BACKUP_MAX_AGE_HOURS: "NaN",
      RECOVERY_DRILL_DAYS: "-10",
    } as NodeJS.ProcessEnv);
    expect(invalid.maxAgeHours).toBe(30);
    expect(invalid.recoveryDrillDays).toBe(30);

    const clamped = parseBackupRecoveryConfig({
      BACKUP_MAX_AGE_HOURS: "999999",
      RECOVERY_DRILL_DAYS: "999999",
    } as NodeJS.ProcessEnv);
    expect(clamped.maxAgeHours).toBe(24 * 365);
    expect(clamped.recoveryDrillDays).toBe(3650);
  });
});
