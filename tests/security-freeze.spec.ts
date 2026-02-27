import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

function randSuffix(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

type FreezeSettings = {
  globalServeDisabled: boolean;
  shareServeDisabled: boolean;
  aliasServeDisabled: boolean;
  ticketServeDisabled: boolean;
};

const DEFAULT_FREEZE: FreezeSettings = {
  globalServeDisabled: false,
  shareServeDisabled: false,
  aliasServeDisabled: false,
  ticketServeDisabled: false,
};

async function tableExists(sql: ReturnType<typeof neon>, tableName: string): Promise<boolean> {
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

async function pickDocId(sql: ReturnType<typeof neon>): Promise<string | null> {
  try {
    const rows = (await sql`
      select d.id::text as id
      from public.docs d
      where coalesce(d.status::text, 'ready') <> 'deleted'
      order by d.created_at desc
      limit 1
    `) as unknown as Array<{ id: string }>;
    return rows?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function readFreeze(sql: ReturnType<typeof neon>): Promise<FreezeSettings> {
  try {
    const rows = (await sql`
      select value
      from public.app_settings
      where key = 'security_freeze'
      limit 1
    `) as unknown as Array<{ value: unknown }>;
    const value = rows?.[0]?.value as Partial<FreezeSettings> | undefined;
    return {
      globalServeDisabled: Boolean(value?.globalServeDisabled),
      shareServeDisabled: Boolean(value?.shareServeDisabled),
      aliasServeDisabled: Boolean(value?.aliasServeDisabled),
      ticketServeDisabled: Boolean(value?.ticketServeDisabled),
    };
  } catch {
    return { ...DEFAULT_FREEZE };
  }
}

async function writeFreeze(sql: ReturnType<typeof neon>, next: Partial<FreezeSettings>): Promise<void> {
  const current = await readFreeze(sql);
  const merged: FreezeSettings = {
    globalServeDisabled:
      typeof next.globalServeDisabled === "boolean" ? next.globalServeDisabled : current.globalServeDisabled,
    shareServeDisabled: typeof next.shareServeDisabled === "boolean" ? next.shareServeDisabled : current.shareServeDisabled,
    aliasServeDisabled: typeof next.aliasServeDisabled === "boolean" ? next.aliasServeDisabled : current.aliasServeDisabled,
    ticketServeDisabled:
      typeof next.ticketServeDisabled === "boolean" ? next.ticketServeDisabled : current.ticketServeDisabled,
  };

  await sql`
    insert into public.app_settings (key, value)
    values ('security_freeze', ${JSON.stringify(merged)}::jsonb)
    on conflict (key) do update set value = excluded.value
  `;
}

test.describe("security freeze controls", () => {
  test("global and share freeze block share raw serving", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const docId = await pickDocId(sql);
    test.skip(!docId, "No docs available for fixture setup");

    const token = `tok_freeze_${randSuffix()}`.slice(0, 64);
    const original = await readFreeze(sql);

    await sql`
      insert into public.share_tokens (token, doc_id, max_views, views_count)
      values (${token}, ${docId}::uuid, null, 0)
    `;

    try {
      await writeFreeze(sql, { globalServeDisabled: true, shareServeDisabled: false });
      const globalResp = await request.get(`/s/${token}/raw`);
      expect(globalResp.status()).toBe(503);

      await writeFreeze(sql, { globalServeDisabled: false, shareServeDisabled: true });
      const shareResp = await request.get(`/s/${token}/raw`);
      expect(shareResp.status()).toBe(503);
    } finally {
      await writeFreeze(sql, original);
      await sql`delete from public.share_tokens where token = ${token}`;
    }
  });

  test("alias freeze blocks alias raw serving", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const hasDocAliases = await tableExists(sql, "doc_aliases");
    test.skip(!hasDocAliases, "doc_aliases table not available");

    const docId = await pickDocId(sql);
    test.skip(!docId, "No docs available for fixture setup");

    const alias = `freeze-a-${randSuffix()}`.toLowerCase();
    const original = await readFreeze(sql);

    await sql`
      insert into public.doc_aliases (alias, doc_id, is_active)
      values (${alias}, ${docId}::uuid, true)
    `;

    try {
      await writeFreeze(sql, { globalServeDisabled: false, aliasServeDisabled: true });
      const resp = await request.get(`/d/${alias}/raw`);
      expect(resp.status()).toBe(503);
    } finally {
      await writeFreeze(sql, original);
      await sql`delete from public.doc_aliases where alias = ${alias}`;
    }
  });

  test("ticket freeze blocks ticket route before ticket lookup", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);
    const original = await readFreeze(sql);

    try {
      await writeFreeze(sql, {
        globalServeDisabled: false,
        shareServeDisabled: false,
        aliasServeDisabled: false,
        ticketServeDisabled: true,
      });
      const resp = await request.get(`/t/does-not-exist-${randSuffix()}`);
      expect(resp.status()).toBe(503);
    } finally {
      await writeFreeze(sql, original);
    }
  });
});
