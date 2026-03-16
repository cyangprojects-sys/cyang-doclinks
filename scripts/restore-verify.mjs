#!/usr/bin/env node

import { createMigrationClient, getMigrationStatus } from "./lib/migrations.mjs";

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

async function main() {
  const sql = createMigrationClient();
  const notes = String(argValue("--notes") || "").trim();
  const recordSuccess = hasFlag("--record-success");
  const recordFailure = hasFlag("--record-failure");
  const requireCurrentMigrations = hasFlag("--require-current-migrations");

  try {
    const rows = await sql.unsafe(`
      select
        (select count(*)::bigint from public.docs) as docs_count,
        (select count(*)::bigint from public.share_tokens) as share_tokens_count,
        (select count(*)::bigint from public.immutable_audit_log) as immutable_audit_count,
        to_regclass('public.recovery_drills')::text as recovery_drills_ready,
        to_regclass('public.schema_migrations')::text as schema_migrations_ready
    `);
    const row = rows[0];
    console.log(
      JSON.stringify(
        {
          docsCount: Number(row.docs_count || 0),
          shareTokensCount: Number(row.share_tokens_count || 0),
          immutableAuditCount: Number(row.immutable_audit_count || 0),
          recoveryDrillsReady: Boolean(row.recovery_drills_ready),
          schemaMigrationsReady: Boolean(row.schema_migrations_ready),
        },
        null,
        2
      )
    );

    if (requireCurrentMigrations) {
      const status = await getMigrationStatus({ sql });
      if (status.pending.length || status.drift.length) {
        throw new Error("Restore verification failed because migrations are not current.");
      }
    }

    if (recordSuccess || recordFailure) {
      await sql.unsafe(
        `
          insert into public.recovery_drills (status, notes, details)
          values ($1, $2, $3::jsonb)
        `,
        [
          recordSuccess ? "success" : "failed",
          notes || null,
          JSON.stringify({
            verifiedAt: new Date().toISOString(),
            requireCurrentMigrations,
          }),
        ]
      );
      console.log(`Recorded recovery drill status: ${recordSuccess ? "success" : "failed"}.`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
