import { expect, test } from "@playwright/test";
import { classifyBackupRecoverySummary, summarizeHealthChecks, type HealthCheck } from "../src/lib/health";

test.describe("health readiness aggregation", () => {
  test("fails readiness when a critical dependency is down", () => {
    const checks: HealthCheck[] = [
      { name: "config", state: "ok", critical: true, summary: "ok" },
      { name: "database", state: "down", critical: true, summary: "down" },
      { name: "backup_recovery", state: "degraded", critical: false, summary: "warn" },
    ];

    const summary = summarizeHealthChecks(checks);
    expect(summary.ok).toBeFalsy();
    expect(summary.status).toBe("down");
    expect(summary.httpStatus).toBe(503);
  });

  test("keeps readiness passing when only non-critical checks are degraded", () => {
    const checks: HealthCheck[] = [
      { name: "config", state: "ok", critical: true, summary: "ok" },
      { name: "database", state: "ok", critical: true, summary: "ok" },
      { name: "storage", state: "ok", critical: true, summary: "ok" },
      { name: "backup_recovery", state: "degraded", critical: false, summary: "warn" },
    ];

    const summary = summarizeHealthChecks(checks);
    expect(summary.ok).toBeTruthy();
    expect(summary.status).toBe("ok");
    expect(summary.httpStatus).toBe(200);
  });

  test("ignores disabled checks when computing readiness", () => {
    const checks: HealthCheck[] = [
      { name: "config", state: "ok", critical: true, summary: "ok" },
      { name: "database", state: "ok", critical: true, summary: "ok" },
      { name: "backup_recovery", state: "disabled", critical: false, summary: "disabled" },
    ];

    const summary = summarizeHealthChecks(checks);
    expect(summary.ok).toBeTruthy();
    expect(summary.status).toBe("ok");
  });

  test("keeps backup recovery healthy when the latest attempt failed but a recent success is still fresh", () => {
    const result = classifyBackupRecoverySummary({
      enabled: true,
      tablesReady: true,
      lastStatus: "failed",
      maxAgeHours: 30,
      recoveryDrillDays: 30,
      hoursSinceLastSuccess: 4,
      freshnessOk: true,
      recoveryDrillDue: false,
    });

    expect(result.state).toBe("ok");
    expect(result.summary).toContain("latest attempt failed");
  });

  test("keeps backup recovery degraded when restore drill cadence is overdue", () => {
    const result = classifyBackupRecoverySummary({
      enabled: true,
      tablesReady: true,
      lastStatus: "ok",
      maxAgeHours: 30,
      recoveryDrillDays: 30,
      hoursSinceLastSuccess: 4,
      freshnessOk: true,
      recoveryDrillDue: true,
    });

    expect(result.state).toBe("degraded");
    expect(result.summary).toContain("restore drill cadence");
  });
});
