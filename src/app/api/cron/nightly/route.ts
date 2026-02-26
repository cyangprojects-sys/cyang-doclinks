export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { aggregateDocViewDaily } from "@/lib/analytics";
import { runRetention } from "@/lib/retention";
import { sendExpirationAlerts } from "@/lib/expirationAlerts";
import { runAutomatedKeyRotation } from "@/lib/keyRotation";
import { migrateLegacyEncryptionBatch } from "@/lib/encryptionMigration";
import { runBackupRecoveryCheck } from "@/lib/backupRecovery";
import { processKeyRotationJobs } from "@/lib/keyRotationJobs";
import { revokeExpiredSharesBatch } from "@/lib/shareLifecycle";
import { runUsageMaintenance } from "@/lib/usageMaintenance";
import { logSecurityEvent } from "@/lib/securityTelemetry";

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

  // 1) Aggregate daily view counts
  const aggregate = await aggregateDocViewDaily();

  // 2) Retention cleanup for raw/high-volume tables
  const retention = await runRetention();

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

  if (expiredSharesRevoked.revoked > 0) {
    await logSecurityEvent({
      type: "expired_shares_auto_revoked",
      severity: "low",
      scope: "cron_nightly",
      message: "Auto-revoked expired share tokens",
      meta: { revoked: expiredSharesRevoked.revoked },
    });
  }

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    aggregate,
    retention,
    expiration_alerts,
    key_rotation,
    key_rotation_jobs,
    legacy_encryption_migration,
    expired_shares_revoked: expiredSharesRevoked,
    usage_maintenance,
    backup_recovery,
  });
}
