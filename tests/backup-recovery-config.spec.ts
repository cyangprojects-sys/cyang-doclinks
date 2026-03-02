import { expect, test } from "@playwright/test";
import { parseBackupRecoveryConfig } from "../src/lib/backupRecovery";

function toProcessEnv(vars: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return vars as unknown as NodeJS.ProcessEnv;
}

test.describe("backup recovery config parsing", () => {
  test("parses enabled flag and trims webhook", () => {
    const out = parseBackupRecoveryConfig(toProcessEnv({
      BACKUP_AUTOMATION_ENABLED: "YES",
      BACKUP_WEBHOOK_URL: "  https://example.test/hook  ",
    }));
    expect(out.enabled).toBeTruthy();
    expect(out.webhook).toBe("https://example.test/hook");
    expect(out.maxAgeHours).toBe(30);
    expect(out.recoveryDrillDays).toBe(30);
  });

  test("treats unknown enabled values as false", () => {
    const out = parseBackupRecoveryConfig(toProcessEnv({
      BACKUP_AUTOMATION_ENABLED: "garbage",
    }));
    expect(out.enabled).toBeFalsy();
  });

  test("clamps and falls back numeric values safely", () => {
    const invalid = parseBackupRecoveryConfig(toProcessEnv({
      BACKUP_MAX_AGE_HOURS: "NaN",
      RECOVERY_DRILL_DAYS: "-10",
    }));
    expect(invalid.maxAgeHours).toBe(30);
    expect(invalid.recoveryDrillDays).toBe(30);

    const clamped = parseBackupRecoveryConfig(toProcessEnv({
      BACKUP_MAX_AGE_HOURS: "999999",
      RECOVERY_DRILL_DAYS: "999999",
    }));
    expect(clamped.maxAgeHours).toBe(24 * 365);
    expect(clamped.recoveryDrillDays).toBe(3650);
  });
});
