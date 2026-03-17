export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { aggregateDocViewDaily } from "@/lib/analytics";
import { runRetention } from "@/lib/retention";
import { runR2OrphanSweep } from "@/lib/retention";
import { sendExpirationAlerts } from "@/lib/expirationAlerts";
import { runAutomatedKeyRotation } from "@/lib/keyRotation";
import { runBackupRecoveryCheck } from "@/lib/backupRecovery";
import { processKeyRotationJobs } from "@/lib/keyRotationJobs";
import { revokeExpiredSharesBatch } from "@/lib/shareLifecycle";
import { runUsageMaintenance } from "@/lib/usageMaintenance";
import {
  detectAliasAccessDeniedSpike,
  detectDbErrorSpike,
  detectScanFailureSpike,
  detectTokenAccessDeniedSpike,
  detectUploadCompletionSpike,
  detectViewSpike,
  enforceGlobalApiRateLimit,
  logSecurityEvent,
} from "@/lib/securityTelemetry";
import { logCronRun } from "@/lib/cronTelemetry";
import { runBillingMaintenance } from "@/lib/billingSubscription";
import { runStatusDailyDigest } from "@/lib/statusSubscriptions";

import { cronUnauthorizedResponse, isCronAuthorized } from "@/lib/cronAuth";

export async function GET(req: NextRequest) {
  const rl = await enforceGlobalApiRateLimit({
    req,
    scope: "ip:cron_nightly",
    limit: Number(process.env.RATE_LIMIT_CRON_NIGHTLY_PER_MIN || 10),
    windowSeconds: 60,
    strict: true,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMIT" },
      { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  if (!isCronAuthorized(req)) {
    return cronUnauthorizedResponse();
  }

  const startedAt = Date.now();
  try {

  // 1) Aggregate daily view counts
  const aggregate = await aggregateDocViewDaily();

  // 2) Retention cleanup for raw/high-volume tables
  const retention = await runRetention();
  const weeklyOrphanSweepDayRaw = Number(process.env.ORPHAN_SWEEP_WEEKDAY_UTC || 0); // 0=Sun..6=Sat
  const weeklyOrphanSweepDay = Number.isFinite(weeklyOrphanSweepDayRaw)
    ? Math.max(0, Math.min(6, Math.floor(weeklyOrphanSweepDayRaw)))
    : 0;
  const nowUtcDay = new Date().getUTCDay();
  const orphan_sweep =
    nowUtcDay === weeklyOrphanSweepDay
      ? await runR2OrphanSweep({
          deleteOrphans: ["1", "true", "yes", "on"].includes(String(process.env.ORPHAN_SWEEP_DELETE || "true").toLowerCase()),
          maxObjects: Math.max(1, Math.min(50_000, Number(process.env.ORPHAN_SWEEP_MAX_OBJECTS || 10_000))),
        })
      : { ok: true, table: "r2.orphaned_objects", note: "Skipped (not scheduled weekday)." };

  // 3) Expiration alert emails + in-app notifications
  const expiration_alerts = await sendExpirationAlerts();

  // 4) Optional automated key rotation
  const key_rotation = await runAutomatedKeyRotation();
  const key_rotation_jobs = await processKeyRotationJobs({
    maxJobs: Math.max(1, Math.min(25, Number(process.env.KEY_ROTATION_CRON_MAX_JOBS || 5))),
  });

  // 5) Auto-disable expired shares so plan limits count strictly by active records
  const expiredSharesRevoked = await revokeExpiredSharesBatch(
    Math.max(1, Math.min(5000, Number(process.env.EXPIRED_SHARES_REVOKE_BATCH || 1000)))
  );

  // 6) Monthly usage maintenance/reset hygiene
  const usage_maintenance = await runUsageMaintenance();

  // 7) Optional backup + recovery checks
  const backup_recovery = await runBackupRecoveryCheck();

  // 8) Billing entitlement maintenance (grace expiry / plan sync)
  const billing_sync = await runBillingMaintenance({
    maxUsers: Math.max(1, Math.min(5000, Number(process.env.BILLING_MAINTENANCE_MAX_USERS || 500))),
  });

  // 8.5) Daily status digest delivery (first cron run in configured 6 AM window)
  const status_digest = await runStatusDailyDigest();

  // 9) Spike alerting rollups (best-effort)
  await detectScanFailureSpike();
  await detectUploadCompletionSpike();
  await detectDbErrorSpike();
  await detectAliasAccessDeniedSpike({});
  await detectTokenAccessDeniedSpike({});
  await detectViewSpike();

  if (expiredSharesRevoked.revoked > 0) {
    await logSecurityEvent({
      type: "expired_shares_auto_revoked",
      severity: "low",
      scope: "cron_nightly",
      message: "Auto-revoked expired share tokens",
      meta: { revoked: expiredSharesRevoked.revoked },
    });
  }

  const duration = Date.now() - startedAt;
  const aggregateObj = (aggregate && typeof aggregate === "object" ? aggregate : {}) as Record<string, unknown>;
  const retentionObj = (retention && typeof retention === "object" ? retention : {}) as Record<string, unknown>;
  const orphanSweepObj = (orphan_sweep && typeof orphan_sweep === "object" ? orphan_sweep : {}) as Record<string, unknown>;
  const keyRotationJobsObj = (key_rotation_jobs && typeof key_rotation_jobs === "object" ? key_rotation_jobs : {}) as Record<string, unknown>;
  const backupRecoveryObj = (backup_recovery && typeof backup_recovery === "object" ? backup_recovery : {}) as Record<string, unknown>;
  const billingSyncObj = (billing_sync && typeof billing_sync === "object" ? billing_sync : {}) as Record<string, unknown>;
  await logCronRun({
    job: "nightly",
    ok: true,
    durationMs: duration,
    meta: {
      aggregateOk: Boolean(aggregateObj.ok),
      retentionOk: Boolean(retentionObj.ok),
      orphanSweepOk: Boolean(orphanSweepObj.ok),
      keyRotationProcessed: keyRotationJobsObj.processed ?? null,
      revokedExpiredShares: expiredSharesRevoked.revoked,
      backupStatus: backupRecoveryObj.backupStatus ?? null,
      billingSyncOk: billingSyncObj.ok ?? null,
      billingUsersScanned: billingSyncObj.usersScanned ?? null,
      statusDigestOk: status_digest.ok,
      statusDigestSent: status_digest.sent ?? 0,
      statusDigestFailed: status_digest.failed ?? 0,
      statusDigestSkipped: status_digest.skipped ?? false,
      statusDigestReason: status_digest.reason ?? null,
    },
  });
  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    duration_ms: duration,
    aggregate,
    retention,
    orphan_sweep,
    expiration_alerts,
    key_rotation,
    key_rotation_jobs,
    expired_shares_revoked: expiredSharesRevoked,
    usage_maintenance,
    backup_recovery,
    billing_sync,
    status_digest,
  });
  } catch (e: unknown) {
    const duration = Date.now() - startedAt;
    await logCronRun({
      job: "nightly",
      ok: false,
      durationMs: duration,
      meta: { error: "CRON_NIGHTLY_FAILED" },
    });
    return NextResponse.json({ ok: false, error: "CRON_NIGHTLY_FAILED" }, { status: 500 });
  }
}
