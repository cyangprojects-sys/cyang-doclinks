export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { aggregateDocViewDaily } from "@/lib/analytics";
import { runRetention } from "@/lib/retention";
import { sendExpirationAlerts } from "@/lib/expirationAlerts";
import { runAutomatedKeyRotation } from "@/lib/keyRotation";
import { migrateLegacyEncryptionBatch } from "@/lib/encryptionMigration";
import { runBackupRecoveryCheck } from "@/lib/backupRecovery";

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

  // 6) Optional backup + recovery checks
  const backup_recovery = await runBackupRecoveryCheck();

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    aggregate,
    retention,
    expiration_alerts,
    key_rotation,
    legacy_encryption_migration,
    backup_recovery,
  });
}
