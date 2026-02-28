import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

type Sql = ReturnType<typeof neon<false, false>>;

function randSuffix(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

type DocRow = {
  id: string;
  moderation_status: string | null;
  scan_status: string | null;
  risk_level: string | null;
};

async function pickDoc(sql: Sql): Promise<DocRow | null> {
  try {
    const rows = (await sql`
      select
        d.id::text as id,
        coalesce(d.moderation_status::text, 'active') as moderation_status,
        coalesce(d.scan_status::text, 'unscanned') as scan_status,
        coalesce(d.risk_level::text, 'low') as risk_level
      from public.docs d
      where coalesce(d.status::text, 'ready') <> 'deleted'
      order by d.created_at desc
      limit 1
    `) as unknown as DocRow[];
    return rows?.[0] ?? null;
  } catch {
    return null;
  }
}

async function pickServableDoc(sql: Sql): Promise<DocRow | null> {
  try {
    const rows = (await sql`
      select
        d.id::text as id,
        coalesce(d.moderation_status::text, 'active') as moderation_status,
        coalesce(d.scan_status::text, 'clean') as scan_status,
        coalesce(d.risk_level::text, 'low') as risk_level
      from public.docs d
      where coalesce(d.status::text, 'ready') <> 'deleted'
        and coalesce(d.moderation_status::text, 'active') = 'active'
        and coalesce(d.scan_status::text, 'clean') = 'clean'
      order by d.created_at desc
      limit 1
    `) as unknown as DocRow[];
    return rows?.[0] ?? null;
  } catch {
    return null;
  }
}

async function columnExists(
  sql: Sql,
  tableName: string,
  columnName: string
): Promise<boolean> {
  try {
    const rows = (await sql`
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ${tableName}
        and column_name = ${columnName}
      limit 1
    `) as unknown as Array<{ "?column?": number }>;
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function tableExists(sql: Sql, tableName: string): Promise<boolean> {
  try {
    const rows = (await sql`
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = ${tableName}
      limit 1
    `) as unknown as Array<{ "?column?": number }>;
    return rows.length > 0;
  } catch {
    return false;
  }
}

test.describe("security state enforcement", () => {
  test("expired and revoked shares are blocked", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const doc = await pickDoc(sql);
    test.skip(!doc, "No docs available for fixture setup");
    if (!doc) return;

    const expiredToken = `tok_expired_${randSuffix()}`.slice(0, 64);
    const revokedToken = `tok_revoked_${randSuffix()}`.slice(0, 64);

    await sql`
      insert into public.share_tokens (token, doc_id, expires_at, max_views, views_count)
      values (${expiredToken}, ${doc.id}::uuid, now() - interval '1 day', null, 0)
    `;
    await sql`
      insert into public.share_tokens (token, doc_id, revoked_at, max_views, views_count)
      values (${revokedToken}, ${doc.id}::uuid, now(), null, 0)
    `;

    const expiredResp = await request.get(`/s/${expiredToken}/raw`);
    expect(expiredResp.status()).toBe(410);

    const revokedResp = await request.get(`/s/${revokedToken}/raw`);
    expect(revokedResp.status()).toBe(410);

    await sql`delete from public.share_tokens where token in (${expiredToken}, ${revokedToken})`;
  });

  test("failed scan, pre-scan states, and quarantined/disabled moderation block serving", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const doc = await pickDoc(sql);
    test.skip(!doc, "No docs available for fixture setup");
    if (!doc) return;

    const token = `tok_block_${randSuffix()}`.slice(0, 64);

    await sql`
      insert into public.share_tokens (token, doc_id, max_views, views_count)
      values (${token}, ${doc.id}::uuid, null, 0)
    `;

    try {
      await sql`update public.docs set scan_status = 'queued' where id = ${doc.id}::uuid`;
      const queuedResp = await request.get(`/s/${token}/raw`);
      expect(queuedResp.status()).toBe(404);

      await sql`update public.docs set scan_status = 'running' where id = ${doc.id}::uuid`;
      const runningResp = await request.get(`/s/${token}/raw`);
      expect(runningResp.status()).toBe(404);

      await sql`update public.docs set scan_status = 'unscanned' where id = ${doc.id}::uuid`;
      const unscannedResp = await request.get(`/s/${token}/raw`);
      expect(unscannedResp.status()).toBe(404);

      await sql`update public.docs set scan_status = 'failed' where id = ${doc.id}::uuid`;
      const failedScanResp = await request.get(`/s/${token}/raw`);
      expect(failedScanResp.status()).toBe(404);

      await sql`
        update public.docs
        set scan_status = 'clean', moderation_status = 'quarantined'
        where id = ${doc.id}::uuid
      `;
      const quarantinedResp = await request.get(`/s/${token}/raw`);
      expect(quarantinedResp.status()).toBe(404);

      await sql`
        update public.docs
        set scan_status = 'clean', moderation_status = 'disabled'
        where id = ${doc.id}::uuid
      `;
      const disabledResp = await request.get(`/s/${token}/raw`);
      expect(disabledResp.status()).toBe(404);
    } finally {
      await sql`
        update public.docs
        set
          moderation_status = ${doc.moderation_status ?? "active"},
          scan_status = ${doc.scan_status ?? "unscanned"},
          risk_level = ${doc.risk_level ?? "low"}
        where id = ${doc.id}::uuid
      `;
      await sql`delete from public.share_tokens where token = ${token}`;
    }
  });

  test("disabled share tokens are blocked when is_active column exists", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const hasShareActive = await columnExists(sql, "share_tokens", "is_active");
    test.skip(!hasShareActive, "share_tokens.is_active column not available");

    const doc = await pickDoc(sql);
    test.skip(!doc, "No docs available for fixture setup");
    if (!doc) return;

    const token = `tok_inactive_${randSuffix()}`.slice(0, 64);
    await sql`
      insert into public.share_tokens (token, doc_id, is_active, max_views, views_count)
      values (${token}, ${doc.id}::uuid, false, null, 0)
    `;

    const resp = await request.get(`/s/${token}/raw`);
    expect(resp.status()).toBe(404);

    await sql`delete from public.share_tokens where token = ${token}`;
  });

  test("disabled organization blocks serving when org flags exist", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const docsHasOrg = await columnExists(sql, "docs", "org_id");
    test.skip(!docsHasOrg, "docs.org_id column not available");

    const orgHasDisabled = await columnExists(sql, "organizations", "disabled");
    const orgHasActive = await columnExists(sql, "organizations", "is_active");
    test.skip(!orgHasDisabled && !orgHasActive, "organizations disabled/active flags not available");

    const rows = (await sql`
      select d.id::text as id, d.org_id::text as org_id
      from public.docs d
      where d.org_id is not null
      order by d.created_at desc
      limit 1
    `) as unknown as Array<{ id: string; org_id: string | null }>;
    const doc = rows?.[0];
    test.skip(!doc?.id || !doc?.org_id, "No doc/org fixture found");
    if (!doc?.id || !doc?.org_id) return;

    const token = `tok_org_block_${randSuffix()}`.slice(0, 64);
    await sql`
      insert into public.share_tokens (token, doc_id, max_views, views_count)
      values (${token}, ${doc.id}::uuid, null, 0)
    `;

    try {
      if (orgHasDisabled) {
        await sql`update public.organizations set disabled = true where id = ${doc.org_id}::uuid`;
      } else if (orgHasActive) {
        await sql`update public.organizations set is_active = false where id = ${doc.org_id}::uuid`;
      }

      const resp = await request.get(`/s/${token}/raw`);
      expect(resp.status()).toBe(404);
    } finally {
      if (orgHasDisabled) {
        await sql`update public.organizations set disabled = false where id = ${doc.org_id}::uuid`;
      }
      if (orgHasActive) {
        await sql`update public.organizations set is_active = true where id = ${doc.org_id}::uuid`;
      }
      await sql`delete from public.share_tokens where token = ${token}`;
    }
  });

  test("disabled/revoked/expired aliases are blocked on raw alias route", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const hasDocAliases = await tableExists(sql, "doc_aliases");
    test.skip(!hasDocAliases, "doc_aliases table not available");

    const doc = await pickDoc(sql);
    test.skip(!doc, "No docs available for fixture setup");
    if (!doc) return;

    const aliasInactive = `a-inactive-${randSuffix()}`.toLowerCase();
    const aliasRevoked = `a-revoked-${randSuffix()}`.toLowerCase();
    const aliasExpired = `a-expired-${randSuffix()}`.toLowerCase();

    const hasRevokedAt = await columnExists(sql, "doc_aliases", "revoked_at");

    await sql`
      insert into public.doc_aliases (alias, doc_id, is_active, expires_at)
      values (${aliasInactive}, ${doc.id}::uuid, false, null)
    `;
    await sql`
      insert into public.doc_aliases (alias, doc_id, is_active, expires_at)
      values (${aliasExpired}, ${doc.id}::uuid, true, now() - interval '1 day')
    `;
    if (hasRevokedAt) {
      await sql`
        insert into public.doc_aliases (alias, doc_id, is_active, revoked_at, expires_at)
        values (${aliasRevoked}, ${doc.id}::uuid, true, now(), null)
      `;
    }

    const inactiveResp = await request.get(`/d/${aliasInactive}/raw`);
    expect(inactiveResp.status()).toBe(404);

    const expiredResp = await request.get(`/d/${aliasExpired}/raw`);
    expect(expiredResp.status()).toBe(404);

    if (hasRevokedAt) {
      const revokedResp = await request.get(`/d/${aliasRevoked}/raw`);
      expect(revokedResp.status()).toBe(404);
    }

    await sql`
      delete from public.doc_aliases
      where alias in (${aliasInactive}, ${aliasExpired}, ${aliasRevoked})
    `;
  });

  test("emergency revoke flow blocks active share immediately", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const doc = await pickServableDoc(sql);
    test.skip(!doc, "No servable docs available for fixture setup");
    if (!doc) return;

    const token = `tok_live_revoke_${randSuffix()}`.slice(0, 64);
    await sql`
      insert into public.share_tokens (token, doc_id, max_views, views_count)
      values (${token}, ${doc.id}::uuid, null, 0)
    `;

    try {
      const before = await request.get(`/s/${token}/raw`);
      expect([302, 429]).toContain(before.status());
      if (before.status() === 429) {
        test.skip(true, "Rate-limited in environment; cannot validate live revoke sequence");
      }

      await sql`
        update public.share_tokens
        set revoked_at = now()
        where token = ${token}
      `;

      const after = await request.get(`/s/${token}/raw`);
      expect(after.status()).toBe(410);
    } finally {
      await sql`delete from public.share_tokens where token = ${token}`;
    }
  });

  test("emergency revoke flow blocks active alias immediately", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const hasDocAliases = await tableExists(sql, "doc_aliases");
    test.skip(!hasDocAliases, "doc_aliases table not available");

    const doc = await pickServableDoc(sql);
    test.skip(!doc, "No servable docs available for fixture setup");
    if (!doc) return;

    const alias = `a-live-revoke-${randSuffix()}`.toLowerCase();
    const hasRevokedAt = await columnExists(sql, "doc_aliases", "revoked_at");

    await sql`
      insert into public.doc_aliases (alias, doc_id, is_active, expires_at)
      values (${alias}, ${doc.id}::uuid, true, null)
    `;

    try {
      const before = await request.get(`/d/${alias}/raw`);
      expect([302, 429]).toContain(before.status());
      if (before.status() === 429) {
        test.skip(true, "Rate-limited in environment; cannot validate live alias revoke sequence");
      }

      if (hasRevokedAt) {
        await sql`
          update public.doc_aliases
          set revoked_at = now()
          where alias = ${alias}
        `;
      } else {
        await sql`
          update public.doc_aliases
          set is_active = false
          where alias = ${alias}
        `;
      }

      const after = await request.get(`/d/${alias}/raw`);
      expect(after.status()).toBe(404);
    } finally {
      await sql`delete from public.doc_aliases where alias = ${alias}`;
    }
  });
});
