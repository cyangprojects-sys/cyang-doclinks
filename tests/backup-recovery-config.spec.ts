import { expect, test } from "@playwright/test";
import { getBackupRecoveryStatusSummary, runBackupRecoveryCheck } from "../src/lib/backupRecovery";

const SNAPSHOT = {
  BACKUP_AUTOMATION_ENABLED: process.env.BACKUP_AUTOMATION_ENABLED,
  BACKUP_WEBHOOK_URL: process.env.BACKUP_WEBHOOK_URL,
  BACKUP_MAX_AGE_HOURS: process.env.BACKUP_MAX_AGE_HOURS,
  RECOVERY_DRILL_DAYS: process.env.RECOVERY_DRILL_DAYS,
  DATABASE_URL: process.env.DATABASE_URL,
};

test.afterEach(() => {
  for (const [key, value] of Object.entries(SNAPSHOT)) {
    if (typeof value === "undefined") delete process.env[key];
    else process.env[key] = value;
  }
});

test.describe("backup recovery config parsing", () => {
  test("reports disabled when automation is not explicitly enabled", async () => {
    delete process.env.DATABASE_URL;
    process.env.BACKUP_AUTOMATION_ENABLED = "garbage";
    process.env.BACKUP_MAX_AGE_HOURS = "30";
    process.env.RECOVERY_DRILL_DAYS = "30";

    const out = await getBackupRecoveryStatusSummary();
    expect(out.enabled).toBeFalsy();
    expect(out.lastStatus).toBe("disabled");
    expect(out.maxAgeHours).toBe(30);
    expect(out.recoveryDrillDays).toBe(30);
  });

  test("clamps numeric config values through the public status summary", async () => {
    delete process.env.DATABASE_URL;
    process.env.BACKUP_AUTOMATION_ENABLED = "yes";
    process.env.BACKUP_MAX_AGE_HOURS = "999999";
    process.env.RECOVERY_DRILL_DAYS = "999999";

    const out = await getBackupRecoveryStatusSummary();
    expect(out.enabled).toBeTruthy();
    expect(out.tablesReady).toBeFalsy();
    expect(out.maxAgeHours).toBe(24 * 365);
    expect(out.recoveryDrillDays).toBe(3650);
  });

  test("trims webhook input before the public backup check emits a ping", async () => {
    delete process.env.DATABASE_URL;
    process.env.BACKUP_AUTOMATION_ENABLED = "YES";
    process.env.BACKUP_WEBHOOK_URL = "  https://example.test/hook  ";

    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    try {
      const out = await runBackupRecoveryCheck();
      expect(out).toMatchObject({ enabled: true, ran: true, backupOk: true, backupStatus: "ok" });
      expect(calls).toEqual(["https://example.test/hook"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
