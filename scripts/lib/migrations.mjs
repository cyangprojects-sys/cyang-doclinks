import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "db", "migrations");
const MIGRATION_FILE_RE = /^\d{4}__[a-z0-9_]+\.sql$/;
const PLACEHOLDER_RE = /__([A-Z0-9_]+)__/g;
const OWNER_EMAIL_RE = /^[^\s@'"]+@[^\s@]+\.[^\s@]+$/;
const MIGRATION_LOCK_KEY_A = 541777;
const MIGRATION_LOCK_KEY_B = 260315;

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

function parseMetadata(content, file) {
  const lines = content.split(/\r?\n/);
  const metadata = {};
  for (const line of lines) {
    const match = line.match(/^--\s*([a-z-]+)\s*:\s*(.+?)\s*$/i);
    if (!match) continue;
    metadata[match[1].toLowerCase()] = match[2].trim();
  }

  const source = metadata.source;
  if (!source) {
    throw new Error(`Migration ${file} is missing a -- source: header.`);
  }

  const requiresEnv = String(metadata["requires-env"] || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return { source, requiresEnv };
}

function sortMigrationNames(names) {
  return [...names].sort((a, b) => a.localeCompare(b, "en"));
}

function validatePlaceholder(name, value) {
  if (name === "OWNER_EMAIL") {
    if (!OWNER_EMAIL_RE.test(value)) {
      throw new Error("OWNER_EMAIL must be a simple email address before applying migrations.");
    }
    return value;
  }

  if (/[\r\n\0'"]/.test(value)) {
    throw new Error(`Placeholder ${name} contains unsupported characters.`);
  }
  return value;
}

function renderSource(sqlText, requiredEnv, env = process.env) {
  for (const name of requiredEnv) {
    const value = String(env[name] || "").trim();
    if (!value) {
      throw new Error(`Missing required env for migration execution: ${name}`);
    }
    validatePlaceholder(name, value);
  }

  const placeholders = Array.from(new Set(Array.from(sqlText.matchAll(PLACEHOLDER_RE), (match) => match[1])));
  let rendered = sqlText;
  for (const placeholder of placeholders) {
    const raw = String(env[placeholder] || "").trim();
    if (!raw) {
      throw new Error(`Missing env for SQL placeholder __${placeholder}__`);
    }
    const safe = validatePlaceholder(placeholder, raw);
    rendered = rendered.replaceAll(`__${placeholder}__`, safe);
  }

  return rendered;
}

export function loadMigrationFiles() {
  if (!existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Missing migrations directory: ${MIGRATIONS_DIR}`);
  }

  const names = sortMigrationNames(
    readdirSync(MIGRATIONS_DIR).filter((name) => MIGRATION_FILE_RE.test(name))
  );
  if (!names.length) {
    throw new Error("No ordered migration files were found in db/migrations.");
  }

  const seenVersions = new Set();
  const seenSources = new Set();

  return names.map((name) => {
    if (seenVersions.has(name)) {
      throw new Error(`Duplicate migration version detected: ${name}`);
    }
    seenVersions.add(name);

    const wrapperPath = join(MIGRATIONS_DIR, name);
    const wrapper = readFileSync(wrapperPath, "utf8");
    const metadata = parseMetadata(wrapper, name);
    const sourcePath = resolve(REPO_ROOT, metadata.source);
    if (!existsSync(sourcePath)) {
      throw new Error(`Migration ${name} references a missing source file: ${metadata.source}`);
    }
    if (seenSources.has(metadata.source)) {
      throw new Error(`Source file is referenced by more than one migration wrapper: ${metadata.source}`);
    }
    seenSources.add(metadata.source);

    const source = readFileSync(sourcePath, "utf8");
    return {
      version: name,
      wrapperPath,
      sourcePath,
      sourceRelativePath: metadata.source,
      requiresEnv: metadata.requiresEnv,
      source,
      checksum: sha256(source),
    };
  });
}

export function verifyMigrationManifest() {
  const migrations = loadMigrationFiles();
  return {
    migrations,
    count: migrations.length,
    first: migrations[0]?.version ?? null,
    last: migrations[migrations.length - 1]?.version ?? null,
  };
}

function getDatabaseUrl(env = process.env) {
  const url = String(env.DATABASE_URL || "").trim();
  if (!url) {
    throw new Error("Missing DATABASE_URL");
  }
  return url;
}

export function createMigrationClient(env = process.env) {
  return postgres(getDatabaseUrl(env), {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
    prepare: false,
  });
}

export async function ensureMigrationLedger(sql) {
  await sql.unsafe(`
    create table if not exists public.schema_migrations (
      version text primary key,
      source_path text not null,
      checksum_sha256 text not null,
      applied_at timestamptz not null default now(),
      execution_ms integer not null,
      metadata jsonb not null default '{}'::jsonb
    )
  `);
}

export async function readAppliedMigrations(sql) {
  const rows = await sql.unsafe(`
    select
      version,
      source_path,
      checksum_sha256,
      applied_at,
      execution_ms,
      metadata
    from public.schema_migrations
    order by version asc
  `);
  const byVersion = new Map();
  for (const row of rows) {
    byVersion.set(row.version, row);
  }
  return byVersion;
}

export async function getMigrationStatus({ sql, env = process.env }) {
  const { migrations } = verifyMigrationManifest();
  await ensureMigrationLedger(sql);
  const applied = await readAppliedMigrations(sql);

  const statuses = migrations.map((migration) => {
    const row = applied.get(migration.version) || null;
    let renderedChecksum = migration.checksum;
    let renderError = null;
    try {
      renderedChecksum = sha256(renderSource(migration.source, migration.requiresEnv, env));
    } catch (error) {
      renderError = error instanceof Error ? error.message : String(error);
    }
    const drift =
      row != null &&
      row.checksum_sha256 !== migration.checksum &&
      row.checksum_sha256 !== renderedChecksum;
    return {
      ...migration,
      applied: row,
      renderedChecksum,
      renderError,
      drift,
      pending: !row,
    };
  });

  return {
    migrations: statuses,
    pending: statuses.filter((item) => item.pending),
    applied: statuses.filter((item) => item.applied),
    drift: statuses.filter((item) => item.drift),
  };
}

export async function applyMigrations({ sql, env = process.env, dryRun = false }) {
  const status = await getMigrationStatus({ sql, env });
  if (status.drift.length) {
    const versions = status.drift.map((item) => item.version).join(", ");
    throw new Error(`Applied migration checksum drift detected for: ${versions}`);
  }

  const applied = [];
  for (const migration of status.pending) {
    const rendered = renderSource(migration.source, migration.requiresEnv, env);
    const executionMs = Date.now();

    if (dryRun) {
      applied.push({
        version: migration.version,
        dryRun: true,
        checksum: sha256(rendered),
      });
      continue;
    }

    await sql.begin(async (trx) => {
      await trx.unsafe(
        `select pg_advisory_xact_lock(${MIGRATION_LOCK_KEY_A}::int, ${MIGRATION_LOCK_KEY_B}::int)`
      );
      await trx.unsafe(rendered);
      await trx.unsafe(
        `
          insert into public.schema_migrations (version, source_path, checksum_sha256, execution_ms, metadata)
          values ($1, $2, $3, $4, $5::jsonb)
        `,
        [
          migration.version,
          migration.sourceRelativePath,
          migration.checksum,
          Math.max(1, Date.now() - executionMs),
          JSON.stringify({
            wrapper: migration.wrapperPath.replace(`${REPO_ROOT}\\`, "").replace(/\\/g, "/"),
          }),
        ]
      );
    });

    applied.push({
      version: migration.version,
      dryRun: false,
      checksum: migration.checksum,
    });
  }

  return applied;
}

export async function adoptMigrations({
  sql,
  env = process.env,
  versions = null,
  note = "",
}) {
  const status = await getMigrationStatus({ sql, env });
  if (status.drift.length) {
    const versionsWithDrift = status.drift.map((item) => item.version).join(", ");
    throw new Error(`Applied migration checksum drift detected for: ${versionsWithDrift}`);
  }

  const requested = versions == null ? null : new Set(versions);
  const pendingByVersion = new Map(status.pending.map((migration) => [migration.version, migration]));
  const targetMigrations =
    requested == null
      ? status.pending
      : Array.from(requested, (version) => {
          const migration = pendingByVersion.get(version);
          if (!migration) {
            throw new Error(`Cannot adopt migration that is not pending: ${version}`);
          }
          return migration;
        });

  if (!targetMigrations.length) {
    return [];
  }

  const adopted = [];
  await sql.begin(async (trx) => {
    await trx.unsafe(
      `select pg_advisory_xact_lock(${MIGRATION_LOCK_KEY_A}::int, ${MIGRATION_LOCK_KEY_B}::int)`
    );

    for (const migration of targetMigrations) {
      await trx.unsafe(
        `
          insert into public.schema_migrations (version, source_path, checksum_sha256, execution_ms, metadata)
          values ($1, $2, $3, $4, $5::jsonb)
        `,
        [
          migration.version,
          migration.sourceRelativePath,
          migration.checksum,
          1,
          JSON.stringify({
            adopted: true,
            note: note || null,
            wrapper: migration.wrapperPath.replace(`${REPO_ROOT}\\`, "").replace(/\\/g, "/"),
          }),
        ]
      );

      adopted.push({
        version: migration.version,
        checksum: migration.checksum,
      });
    }
  });

  return adopted;
}
