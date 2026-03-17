# Database Migrations

Last updated: March 15, 2026

DocLinks now uses an ordered migration manifest under `db/migrations/` instead of ad hoc SQL file execution.

## Commands

Verify the manifest on any machine:

```bash
npm run db:migrations:verify
```

Preview current database status:

```bash
npm run db:migrate -- status
```

Apply pending migrations:

```bash
npm run db:migrate -- apply
```

Adopt an existing database whose schema was applied outside the ledger:

```bash
npm run db:migrate -- adopt --all-pending --note "adopted from manual SQL"
```

## How It Works

- Ordered wrapper files live in `db/migrations/0001__*.sql`.
- Each wrapper points at a human-readable source file in `scripts/sql/`.
- Applied migrations are recorded in `public.schema_migrations`.
- Execution order is deterministic by wrapper filename.
- Failed migrations do not advance the ledger.
- Drift is detected if an applied migration no longer matches the repo checksum.

## Creating a New Migration

1. Add or update the SQL body in `scripts/sql/<name>.sql`.
2. Add a new ordered wrapper in `db/migrations/` with the next sequence number:

```sql
-- source: scripts/sql/<name>.sql
```

3. If the SQL requires controlled placeholder substitution, declare it in the wrapper:

```sql
-- source: scripts/sql/<name>.sql
-- requires-env: OWNER_EMAIL
```

4. Run:

```bash
npm run db:migrations:verify
```

## Promotion Flow

1. Run `npm run db:migrate -- status` on staging.
2. Apply pending migrations on staging.
3. Run `npm run release:gate`.
4. Repeat on production during the deployment window.

## Adopting an Existing Database

Use `adopt --all-pending` only when the database schema already matches the repo migrations but `public.schema_migrations` is empty or incomplete because the SQL was applied manually before the ledger existed.

- `adopt` does not execute migration SQL.
- It records pending wrappers in `public.schema_migrations` using the current repo checksums.
- This is intended for one-time ledger repair or migration-tool cutovers.
- Do not use it to skip real schema changes that have not actually been applied.

## Rollback Guidance

Full rollback automation is intentionally not provided for these SQL changes.

Use this sequence instead:

1. Take a fresh database backup before applying production migrations.
2. If a migration fails, fix forward with a new ordered migration whenever possible.
3. If you must roll back data/schema state, restore from backup into a verified branch/database first.
4. Validate restore integrity with `npm run restore:verify -- --require-current-migrations`.

Do not edit or reorder existing applied migration wrappers after promotion.
