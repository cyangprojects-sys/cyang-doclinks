export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { aggregateDocViewDaily } from "@/lib/analytics";
import { runRetention } from "@/lib/retention";
import { runR2OrphanSweep } from "@/lib/retention";
import { sendExpirationAlerts } from "@/lib/expirationAlerts";
import { runAutomatedKeyRotation } from "@/lib/keyRotation";
import { migrateLegacyEncryptionBatch } from "@/lib/encryptionMigration";
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
  logSecurityEvent,
} from "@/lib/securityTelemetry";
import { logCronRun } from "@/lib/cronTelemetry";
import { runBillingMaintenance } from "@/lib/billingSubscription";

import { isCronAuthorized } from "@/lib/cronAuth";

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json(
      {
        ok: false,
        error: "UNAUTHORIZED",
        hint:
          "Set CRON_SECRET in Vercel env vars. Vercel will send it as the Authorization header for cron invocations.",
      },
      { status: 401 }
    );
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

  // 5) Optional legacy encryption migration batch
  const legacy_migration_enabled = ["1", "true", "yes", "on"].includes(
    String(process.env.LEGACY_MIGRATION_ENABLED || "").trim().toLowerCase()
  );
  const legacy_encryption_migration = legacy_migration_enabled
    ? await migrateLegacyEncryptionBatch({
        limit: Math.max(1, Math.min(250, Number(process.env.LEGACY_MIGRATION_BATCH || 25))),
        dryRun: false,
      })
    : { enabled: false };

  // 6) Auto-disable expired shares so plan limits count strictly by active records
  const expiredSharesRevoked = await revokeExpiredSharesBatch(
    Math.max(1, Math.min(5000, Number(process.env.EXPIRED_SHARES_REVOKE_BATCH || 1000)))
  );

  // 7) Monthly usage maintenance/reset hygiene
  const usage_maintenance = await runUsageMaintenance();

  // 8) Optional backup + recovery checks
  const backup_recovery = await runBackupRecoveryCheck();

  // 9) Billing entitlement maintenance (grace expiry / plan sync)
  const billing_sync = await runBillingMaintenance({
    maxUsers: Math.max(1, Math.min(5000, Number(process.env.BILLING_MAINTENANCE_MAX_USERS || 500))),
  });

  // 10) Spike alerting rollups (best-effort)
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
      billingUsersScanned: billingSyncObj.usersScanned ?? null,
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
    legacy_encryption_migration,
    expired_shares_revoked: expiredSharesRevoked,
    usage_maintenance,
    backup_recovery,
    billing_sync,
  });
  } catch (e: unknown) {
    const duration = Date.now() - startedAt;
    const msg = e instanceof Error ? e.message : String(e);
    await logCronRun({
      job: "nightly",
      ok: false,
      durationMs: duration,
      meta: { error: msg },
    });
    return NextResponse.json({ ok: false, error: "CRON_NIGHTLY_FAILED" }, { status: 500 });
  }
}
