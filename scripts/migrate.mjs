#!/usr/bin/env node

import {
  applyMigrations,
  createMigrationClient,
  getMigrationStatus,
  verifyMigrationManifest,
} from "./lib/migrations.mjs";

function usage() {
  console.log(`Usage:
  node scripts/migrate.mjs verify
  node scripts/migrate.mjs plan
  node scripts/migrate.mjs status
  node scripts/migrate.mjs apply
  node scripts/migrate.mjs apply --dry-run
`);
}

async function withClient(fn) {
  const sql = createMigrationClient();
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  const command = String(process.argv[2] || "verify").trim().toLowerCase();
  const dryRun = process.argv.includes("--dry-run");

  if (command === "help" || command === "--help" || command === "-h") {
    usage();
    return;
  }

  if (command === "verify") {
    const summary = verifyMigrationManifest();
    console.log(
      `Migration manifest verified: ${summary.count} ordered files (${summary.first} -> ${summary.last}).`
    );
    return;
  }

  if (command === "plan" || command === "status") {
    const status = await withClient((sql) => getMigrationStatus({ sql }));
    for (const migration of status.migrations) {
      const state = migration.drift ? "drift" : migration.pending ? "pending" : "applied";
      console.log(`${migration.version}\t${state}\t${migration.sourceRelativePath}`);
    }
    if (status.drift.length) {
      throw new Error(`Checksum drift detected for ${status.drift.length} applied migration(s).`);
    }
    console.log(
      `Applied: ${status.applied.length}. Pending: ${status.pending.length}. Drift: ${status.drift.length}.`
    );
    return;
  }

  if (command === "apply") {
    const applied = await withClient((sql) => applyMigrations({ sql, dryRun }));
    if (!applied.length) {
      console.log("No pending migrations.");
      return;
    }
    for (const migration of applied) {
      console.log(
        `${migration.version}\t${migration.dryRun ? "dry-run" : "applied"}\t${migration.checksum}`
      );
    }
    console.log(`${dryRun ? "Planned" : "Applied"} ${applied.length} migration(s).`);
    return;
  }

  usage();
  throw new Error(`Unknown migration command: ${command}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Migration command failed: ${message}`);
  process.exit(1);
});
