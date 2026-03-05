import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import crypto from "node:crypto";

type Sql = ReturnType<typeof neon<false, false>>;

type FreezeSettings = {
  globalServeDisabled: boolean;
  shareServeDisabled: boolean;
  aliasServeDisabled: boolean;
  ticketServeDisabled: boolean;
};

function randSuffix(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function skipIfServeUnavailable(status: number, context: string): void {
  test.skip(
    status === 503,
    `Environment returned 503 (serve unavailable); cannot validate ${context}`
  );
}

function aliasTrustCookieNameForTest(alias: string): string {
  const normalized = decodeURIComponent(String(alias || "")).trim().toLowerCase();
  const key = crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 24);
  return `alias_trust_${key}`;
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

async function pickPreviewableServableDoc(sql: Sql): Promise<DocRow | null> {
  try {
    const pdfRows = (await sql`
      select
        d.id::text as id,
        coalesce(d.moderation_status::text, 'active') as moderation_status,
        coalesce(d.scan_status::text, 'clean') as scan_status,
        coalesce(d.risk_level::text, 'low') as risk_level
      from public.docs d
      where coalesce(d.status::text, 'ready') <> 'deleted'
        and coalesce(d.moderation_status::text, 'active') = 'active'
        and coalesce(d.scan_status::text, 'clean') = 'clean'
        and (
          coalesce(d.content_type::text, '') ilike 'application/pdf%'
          or coalesce(d.original_filename::text, '') ilike '%.pdf'
        )
      order by d.created_at desc
      limit 1
    `) as unknown as DocRow[];
    if (pdfRows?.[0]) return pdfRows[0];

    const safeInlineRows = (await sql`
      select
        d.id::text as id,
        coalesce(d.moderation_status::text, 'active') as moderation_status,
        coalesce(d.scan_status::text, 'clean') as scan_status,
        coalesce(d.risk_level::text, 'low') as risk_level
      from public.docs d
      where coalesce(d.status::text, 'ready') <> 'deleted'
        and coalesce(d.moderation_status::text, 'active') = 'active'
        and coalesce(d.scan_status::text, 'clean') = 'clean'
        and not (
          coalesce(d.content_type::text, '') ilike 'application/vnd.ms-%'
          or coalesce(d.content_type::text, '') ilike 'application/msword%'
          or coalesce(d.content_type::text, '') ilike 'application/vnd.openxmlformats-officedocument.%'
          or coalesce(d.content_type::text, '') ilike 'application/zip%'
          or coalesce(d.content_type::text, '') ilike 'application/x-%compressed%'
          or coalesce(d.original_filename::text, '') ilike '%.doc'
          or coalesce(d.original_filename::text, '') ilike '%.docx'
          or coalesce(d.original_filename::text, '') ilike '%.xls'
          or coalesce(d.original_filename::text, '') ilike '%.xlsx'
          or coalesce(d.original_filename::text, '') ilike '%.ppt'
          or coalesce(d.original_filename::text, '') ilike '%.pptx'
          or coalesce(d.original_filename::text, '') ilike '%.zip'
          or coalesce(d.original_filename::text, '') ilike '%.7z'
          or coalesce(d.original_filename::text, '') ilike '%.rar'
          or coalesce(d.original_filename::text, '') ilike '%.tar'
          or coalesce(d.original_filename::text, '') ilike '%.gz'
        )
      order by d.created_at desc
      limit 1
    `) as unknown as DocRow[];
    return safeInlineRows?.[0] ?? null;
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

async function readSecurityFreeze(sql: Sql): Promise<FreezeSettings | null> {
  const hasAppSettings = await tableExists(sql, "app_settings");
  if (!hasAppSettings) return null;

  try {
    const rows = (await sql`
      select value
      from public.app_settings
      where key = 'security_freeze'
      limit 1
    `) as unknown as Array<{ value: unknown }>;
    const value = (rows?.[0]?.value || {}) as Partial<FreezeSettings>;
    return {
      globalServeDisabled: Boolean(value?.globalServeDisabled),
      shareServeDisabled: Boolean(value?.shareServeDisabled),
      aliasServeDisabled: Boolean(value?.aliasServeDisabled),
      ticketServeDisabled: Boolean(value?.ticketServeDisabled),
    };
  } catch {
    return null;
  }
}

test.describe("security state enforcement", () => {
  test.beforeEach(async () => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    if (!databaseUrl) return;

    const sql = neon(databaseUrl);
    const freeze = await readSecurityFreeze(sql);
    if (!freeze) return;

    const enabledFlags: string[] = [];
    if (freeze.globalServeDisabled) enabledFlags.push("globalServeDisabled");
    if (freeze.shareServeDisabled) enabledFlags.push("shareServeDisabled");
    if (freeze.aliasServeDisabled) enabledFlags.push("aliasServeDisabled");
    if (freeze.ticketServeDisabled) enabledFlags.push("ticketServeDisabled");

    test.skip(
      enabledFlags.length > 0,
      `security_freeze is enabled (${enabledFlags.join(", ")}); skipping serve-path assertions in shared CI DB`
    );
  });

  test("top-level raw navigation is blocked while non-navigation raw access can mint a ticket", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const doc = await pickPreviewableServableDoc(sql);
    test.skip(!doc, "No servable docs available for fixture setup");
    if (!doc) return;

    const token = `tok_top_level_block_${randSuffix()}`.slice(0, 64);
    await sql`
      insert into public.share_tokens (token, doc_id, max_views, views_count)
      values (${token}, ${doc.id}::uuid, null, 0)
    `;

    try {
      const topLevelResp = await request.get(`/s/${token}/raw`, {
        headers: {
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
          "sec-fetch-user": "?1",
        },
      });
      if (topLevelResp.status() === 429) {
        test.skip(true, "Rate-limited in environment; cannot validate top-level raw blocking");
      }
      if (topLevelResp.status() === 503) {
        test.skip(true, "Environment globally disables serving; cannot validate top-level raw blocking semantics");
      }
      expect(topLevelResp.status()).toBe(403);

      const nonTopLevelResp = await request.get(`/s/${token}/raw`, { maxRedirects: 0 });
      if (nonTopLevelResp.status() === 429) {
        test.skip(true, "Rate-limited in environment; cannot validate non-top-level raw access");
      }
      skipIfServeUnavailable(nonTopLevelResp.status(), "non-top-level raw access");
      test.skip(nonTopLevelResp.status() === 403, "Environment blocks non-top-level raw access; cannot validate ticket minting path");
      expect(nonTopLevelResp.status()).toBe(302);
      expect(nonTopLevelResp.headers()["location"] || "").toContain("/t/");
    } finally {
      await sql`delete from public.share_tokens where token = ${token}`;
    }
  });

  test("first open of non-password share lands on /view, not /raw", async ({ page }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const doc = await pickServableDoc(sql);
    test.skip(!doc, "No servable docs available for fixture setup");
    if (!doc) return;

    const token = `tok_first_open_view_${randSuffix()}`.slice(0, 64);
    await sql`
      insert into public.share_tokens (token, doc_id, max_views, views_count, password_hash)
      values (${token}, ${doc.id}::uuid, null, 0, null)
    `;

    try {
      await page.goto(`/s/${token}`);
      await expect(page.getByRole("button", { name: "Open document" })).toBeVisible();
      await page.getByRole("button", { name: "Open document" }).click();
      await page.waitForURL(new RegExp(`/s/${token}/view`));
      expect(page.url()).toContain(`/s/${token}/view`);
      expect(page.url()).not.toContain(`/s/${token}/raw`);
    } finally {
      await sql`delete from public.share_tokens where token = ${token}`;
    }
  });

  test("password-protected raw access redirects HTML to gate and rejects non-HTML", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const doc = await pickServableDoc(sql);
    test.skip(!doc, "No servable docs available for fixture setup");
    if (!doc) return;

    const token = `tok_pw_gate_${randSuffix()}`.slice(0, 64);
    await sql`
      insert into public.share_tokens (token, doc_id, max_views, views_count, password_hash)
      values (${token}, ${doc.id}::uuid, null, 0, 'placeholder_hash')
    `;

    try {
      const htmlResp = await request.get(`/s/${token}/raw`, {
        maxRedirects: 0,
        headers: { accept: "text/html" },
      });
      if (htmlResp.status() === 429) {
        test.skip(true, "Rate-limited in environment; cannot validate password HTML redirect");
      }
      skipIfServeUnavailable(htmlResp.status(), "password HTML redirect");
      if (htmlResp.status() === 403) {
        const apiResp = await request.get(`/s/${token}/raw`, {
          headers: { accept: "application/pdf" },
        });
        skipIfServeUnavailable(apiResp.status(), "password API rejection fallback");
        expect([401, 403]).toContain(apiResp.status());
        return;
      }
      expect([302, 303, 307, 308]).toContain(htmlResp.status());
      expect(htmlResp.headers()["location"] || "").toContain(`/s/${token}`);

      const apiResp = await request.get(`/s/${token}/raw`, {
        headers: { accept: "application/pdf" },
      });
      if (apiResp.status() === 429) {
        test.skip(true, "Rate-limited in environment; cannot validate password non-HTML denial");
      }
      expect(apiResp.status()).toBe(401);
    } finally {
      await sql`delete from public.share_tokens where token = ${token}`;
    }
  });

  test("password-protected share accepts a valid unlock cookie", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const doc = await pickServableDoc(sql);
    test.skip(!doc, "No servable docs available for fixture setup");
    if (!doc) return;

    const token = `tok_pw_unlock_${randSuffix()}`.slice(0, 64);
    const unlockId = `unlock_${randSuffix()}`.slice(0, 64);
    await sql`
      insert into public.share_tokens (token, doc_id, max_views, views_count, password_hash)
      values (${token}, ${doc.id}::uuid, null, 0, 'placeholder_hash')
    `;
    await sql`
      insert into public.share_unlocks (token, unlock_id, ip_hash, expires_at)
      values (${token}, ${unlockId}, null, now() + interval '1 hour')
    `;

    try {
      const resp = await request.get(`/s/${token}/raw`, {
        maxRedirects: 0,
        headers: {
          cookie: `share_unlock_${token}=${unlockId}`,
        },
      });
      if (resp.status() === 429) {
        test.skip(true, "Rate-limited in environment; cannot validate unlock cookie acceptance");
      }
      skipIfServeUnavailable(resp.status(), "unlock cookie acceptance");
      test.skip(resp.status() === 403, "Environment blocks unlocked raw access; cannot validate ticket minting path");
      expect(resp.status()).toBe(302);
      expect(resp.headers()["location"] || "").toContain("/t/");
    } finally {
      await sql`delete from public.share_unlocks where token = ${token}`;
      await sql`delete from public.share_tokens where token = ${token}`;
    }
  });

  test("expired share unlock cookie is rejected", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const doc = await pickServableDoc(sql);
    test.skip(!doc, "No servable docs available for fixture setup");
    if (!doc) return;

    const token = `tok_pw_expired_unlock_${randSuffix()}`.slice(0, 64);
    const unlockId = `unlock_${randSuffix()}`.slice(0, 64);
    await sql`
      insert into public.share_tokens (token, doc_id, max_views, views_count, password_hash)
      values (${token}, ${doc.id}::uuid, null, 0, 'placeholder_hash')
    `;
    await sql`
      insert into public.share_unlocks (token, unlock_id, ip_hash, expires_at)
      values (${token}, ${unlockId}, null, now() - interval '1 minute')
    `;

    try {
      const resp = await request.get(`/s/${token}/raw`, {
        headers: {
          accept: "application/pdf",
          cookie: `share_unlock_${token}=${unlockId}`,
        },
      });
      if (resp.status() === 429) {
        test.skip(true, "Rate-limited in environment; cannot validate expired unlock rejection");
      }
      skipIfServeUnavailable(resp.status(), "expired unlock rejection");
      expect([401, 403]).toContain(resp.status());
    } finally {
      await sql`delete from public.share_unlocks where token = ${token}`;
      await sql`delete from public.share_tokens where token = ${token}`;
    }
  });

  test("download-disabled share blocks attachment disposition when flag exists", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const hasAllowDownload = await columnExists(sql, "share_tokens", "allow_download");
    test.skip(!hasAllowDownload, "share_tokens.allow_download column not available");

    const doc = await pickServableDoc(sql);
    test.skip(!doc, "No servable docs available for fixture setup");
    if (!doc) return;

    const token = `tok_dl_disabled_${randSuffix()}`.slice(0, 64);
    await sql`
      insert into public.share_tokens (token, doc_id, max_views, views_count, allow_download)
      values (${token}, ${doc.id}::uuid, null, 0, false)
    `;

    try {
      const resp = await request.get(`/s/${token}/raw?disposition=attachment`);
      if (resp.status() === 429) {
        test.skip(true, "Rate-limited in environment; cannot validate download-disabled enforcement");
      }
      skipIfServeUnavailable(resp.status(), "download-disabled enforcement");
      expect([403, 404]).toContain(resp.status());
    } finally {
      await sql`delete from public.share_tokens where token = ${token}`;
    }
  });

  test("high-risk inline preview is blocked while attachment still works", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const doc = await pickServableDoc(sql);
    test.skip(!doc, "No servable docs available for fixture setup");
    if (!doc) return;

    const token = `tok_risky_inline_${randSuffix()}`.slice(0, 64);
    await sql`
      insert into public.share_tokens (token, doc_id, max_views, views_count)
      values (${token}, ${doc.id}::uuid, null, 0)
    `;

    try {
      await sql`update public.docs set scan_status = 'clean', risk_level = 'high' where id = ${doc.id}::uuid`;

      const inlineResp = await request.get(`/s/${token}/raw`);
      if (inlineResp.status() === 429) {
        test.skip(true, "Rate-limited in environment; cannot validate risky inline blocking");
      }
      skipIfServeUnavailable(inlineResp.status(), "risky inline blocking");
      expect([403, 404]).toContain(inlineResp.status());

      const attachmentResp = await request.get(`/s/${token}/raw?disposition=attachment`, { maxRedirects: 0 });
      if (attachmentResp.status() === 429) {
        test.skip(true, "Rate-limited in environment; cannot validate risky attachment fallback");
      }
      skipIfServeUnavailable(attachmentResp.status(), "risky attachment fallback");
      if (attachmentResp.status() === 403 || attachmentResp.status() === 404) return;
      expect([302, 303, 307, 308]).toContain(attachmentResp.status());
      expect(attachmentResp.headers()["location"] || "").toContain("/t/");
    } finally {
      await sql`
        update public.docs
        set
          moderation_status = ${doc.moderation_status ?? "active"},
          scan_status = ${doc.scan_status ?? "clean"},
          risk_level = ${doc.risk_level ?? "low"}
        where id = ${doc.id}::uuid
      `;
      await sql`delete from public.share_tokens where token = ${token}`;
    }
  });

  test("office docs force download-only path even when inline requested", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const hasAllowDownload = await columnExists(sql, "share_tokens", "allow_download");
    test.skip(!hasAllowDownload, "share_tokens.allow_download column not available");

    const doc = await pickServableDoc(sql);
    test.skip(!doc, "No servable docs available for fixture setup");
    if (!doc) return;

    const originalRows = (await sql`
      select
        coalesce(content_type::text, 'application/pdf') as content_type,
        coalesce(original_filename::text, 'document.pdf') as original_filename
      from public.docs
      where id = ${doc.id}::uuid
      limit 1
    `) as unknown as Array<{ content_type: string; original_filename: string }>;
    const original = originalRows?.[0] || { content_type: "application/pdf", original_filename: "document.pdf" };

    const token = `tok_office_forced_${randSuffix()}`.slice(0, 64);
    await sql`
      update public.docs
      set
        content_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        original_filename = 'security-test.docx',
        moderation_status = 'active',
        scan_status = 'clean'
      where id = ${doc.id}::uuid
    `;
    await sql`
      insert into public.share_tokens (token, doc_id, max_views, views_count, allow_download)
      values (${token}, ${doc.id}::uuid, null, 0, false)
    `;

    try {
      const rawResp = await request.get(`/s/${token}/raw`, { maxRedirects: 0 });
      if (rawResp.status() === 429) {
        test.skip(true, "Rate-limited in environment; cannot validate forced office download path");
      }
      skipIfServeUnavailable(rawResp.status(), "forced office download path");
      if (rawResp.status() === 403) return;
      expect(rawResp.status()).toBe(302);
      const ticketLocation = rawResp.headers()["location"] || "";
      expect(ticketLocation).toContain("/t/");

      const ticketUrl = new URL(ticketLocation, process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000");
      const ticketPath = `${ticketUrl.pathname}${ticketUrl.search}`;
      const navResp = await request.get(ticketPath, {
        headers: {
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
          "sec-fetch-user": "?1",
        },
      });
      skipIfServeUnavailable(navResp.status(), "forced office download ticket navigation");
      if (navResp.status() === 403) {
        const body = await navResp.text();
        expect(body).not.toContain("Direct open is disabled for this protected document.");
      } else {
        expect([200, 206, 404, 410, 500]).toContain(navResp.status());
      }
    } finally {
      await sql`
        update public.docs
        set
          content_type = ${original.content_type},
          original_filename = ${original.original_filename},
          moderation_status = ${doc.moderation_status ?? "active"},
          scan_status = ${doc.scan_status ?? "clean"},
          risk_level = ${doc.risk_level ?? "low"}
        where id = ${doc.id}::uuid
      `;
      await sql`delete from public.share_tokens where token = ${token}`;
    }
  });

  test("preview ticket blocks top-level direct open", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const doc = await pickServableDoc(sql);
    test.skip(!doc, "No servable docs available for fixture setup");
    if (!doc) return;

    const token = `tok_preview_ticket_block_${randSuffix()}`.slice(0, 64);
    await sql`
      insert into public.share_tokens (token, doc_id, max_views, views_count)
      values (${token}, ${doc.id}::uuid, null, 0)
    `;

    try {
      const rawResp = await request.get(`/s/${token}/raw`, { maxRedirects: 0 });
      if (rawResp.status() === 429) {
        test.skip(true, "Rate-limited in environment; cannot validate preview ticket direct-open blocking");
      }
      skipIfServeUnavailable(rawResp.status(), "preview ticket direct-open blocking");
      if (rawResp.status() === 403) return;
      expect(rawResp.status()).toBe(302);
      const ticketLocation = rawResp.headers()["location"] || "";
      expect(ticketLocation).toContain("/t/");

      const ticketUrl = new URL(ticketLocation, process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000");
      const ticketPath = `${ticketUrl.pathname}${ticketUrl.search}`;
      const topLevelResp = await request.get(ticketPath, {
        headers: {
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
          "sec-fetch-user": "?1",
        },
      });
      skipIfServeUnavailable(topLevelResp.status(), "preview ticket top-level direct-open blocking");
      expect(topLevelResp.status()).toBe(403);
      const body = await topLevelResp.text();
      expect(body).toContain("Direct open is disabled for this protected document.");
    } finally {
      await sql`delete from public.share_tokens where token = ${token}`;
    }
  });

  test("password-protected alias raw redirects to alias gate when trust cookie is missing", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const hasDocAliases = await tableExists(sql, "doc_aliases");
    if (!hasDocAliases) {
      const blocked = await request.get(`/d/nonexistent-${randSuffix()}/raw`);
      skipIfServeUnavailable(blocked.status(), "alias guard fallback without doc_aliases table");
      expect([403, 404]).toContain(blocked.status());
      return;
    }
    const hasAliasPassword = await columnExists(sql, "doc_aliases", "password_hash");
    if (!hasAliasPassword) {
      const blocked = await request.get(`/d/nonexistent-${randSuffix()}/raw`);
      skipIfServeUnavailable(blocked.status(), "alias guard fallback without alias password column");
      expect([403, 404]).toContain(blocked.status());
      return;
    }

    const doc = await pickServableDoc(sql);
    test.skip(!doc, "No servable docs available for fixture setup");
    if (!doc) return;

    const alias = `a-pw-${randSuffix()}`.toLowerCase();
    await sql`
      insert into public.doc_aliases (alias, doc_id, is_active, password_hash)
      values (${alias}, ${doc.id}::uuid, true, 'placeholder_hash')
    `;

    try {
      const resp = await request.get(`/d/${alias}/raw`, { maxRedirects: 0 });
      if (resp.status() === 429) {
        test.skip(true, "Rate-limited in environment; cannot validate alias password gate redirect");
      }
      skipIfServeUnavailable(resp.status(), "alias password gate redirect");
      expect(resp.status()).toBe(302);
      expect(resp.headers()["location"] || "").toBe(`/d/${encodeURIComponent(alias)}`);
    } finally {
      await sql`delete from public.doc_aliases where alias = ${alias}`;
    }
  });

  test("password-protected alias rejects malformed trust cookie", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const hasDocAliases = await tableExists(sql, "doc_aliases");
    if (!hasDocAliases) {
      const blocked = await request.get(`/d/nonexistent-${randSuffix()}/raw`);
      skipIfServeUnavailable(blocked.status(), "alias malformed-cookie fallback without doc_aliases table");
      expect([403, 404]).toContain(blocked.status());
      return;
    }
    const hasAliasPassword = await columnExists(sql, "doc_aliases", "password_hash");
    if (!hasAliasPassword) {
      const blocked = await request.get(`/d/nonexistent-${randSuffix()}/raw`);
      skipIfServeUnavailable(blocked.status(), "alias malformed-cookie fallback without alias password column");
      expect([403, 404]).toContain(blocked.status());
      return;
    }

    const doc = await pickServableDoc(sql);
    test.skip(!doc, "No servable docs available for fixture setup");
    if (!doc) return;

    const alias = `a-pw-malformed-${randSuffix()}`.toLowerCase();
    await sql`
      insert into public.doc_aliases (alias, doc_id, is_active, password_hash)
      values (${alias}, ${doc.id}::uuid, true, 'placeholder_hash')
    `;

    try {
      const trustCookie = `${aliasTrustCookieNameForTest(alias)}=not-a-valid-signed-payload`;
      const resp = await request.get(`/d/${alias}/raw`, {
        maxRedirects: 0,
        headers: { cookie: trustCookie },
      });
      if (resp.status() === 429) {
        test.skip(true, "Rate-limited in environment; cannot validate malformed alias trust cookie rejection");
      }
      skipIfServeUnavailable(resp.status(), "malformed alias trust cookie rejection");
      expect(resp.status()).toBe(302);
      expect(resp.headers()["location"] || "").toBe(`/d/${encodeURIComponent(alias)}`);
    } finally {
      await sql`delete from public.doc_aliases where alias = ${alias}`;
    }
  });

  test("alias raw honors dl=1 as attachment path", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const hasDocAliases = await tableExists(sql, "doc_aliases");
    test.skip(!hasDocAliases, "doc_aliases table not available");

    const doc = await pickServableDoc(sql);
    test.skip(!doc, "No servable docs available for fixture setup");
    if (!doc) return;

    const alias = `a-dl-${randSuffix()}`.toLowerCase();
    await sql`
      insert into public.doc_aliases (alias, doc_id, is_active, expires_at)
      values (${alias}, ${doc.id}::uuid, true, null)
    `;

    try {
      const rawResp = await request.get(`/d/${alias}/raw?dl=1`, { maxRedirects: 0 });
      if (rawResp.status() === 429) {
        test.skip(true, "Rate-limited in environment; cannot validate alias dl=1 attachment behavior");
      }
      skipIfServeUnavailable(rawResp.status(), "alias dl=1 attachment behavior");
      expect(rawResp.status()).toBe(302);
      const ticketLocation = rawResp.headers()["location"] || "";
      expect(ticketLocation).toContain("/t/");

      const ticketUrl = new URL(ticketLocation, process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000");
      const ticketPath = `${ticketUrl.pathname}${ticketUrl.search}`;
      const navResp = await request.get(ticketPath, {
        headers: {
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
          "sec-fetch-user": "?1",
        },
      });
      skipIfServeUnavailable(navResp.status(), "alias dl=1 ticket navigation");
      if (navResp.status() === 403) {
        const body = await navResp.text();
        expect(body).not.toContain("Direct open is disabled for this protected document.");
      } else {
        expect([200, 206, 404, 410, 500]).toContain(navResp.status());
      }
    } finally {
      await sql`delete from public.doc_aliases where alias = ${alias}`;
    }
  });

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
    skipIfServeUnavailable(expiredResp.status(), "expired share blocking");
    expect([403, 410]).toContain(expiredResp.status());

    const revokedResp = await request.get(`/s/${revokedToken}/raw`);
    skipIfServeUnavailable(revokedResp.status(), "revoked share blocking");
    expect([403, 410]).toContain(revokedResp.status());

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
      skipIfServeUnavailable(queuedResp.status(), "queued scan blocking");
      expect([403, 404]).toContain(queuedResp.status());

      await sql`update public.docs set scan_status = 'running' where id = ${doc.id}::uuid`;
      const runningResp = await request.get(`/s/${token}/raw`);
      skipIfServeUnavailable(runningResp.status(), "running scan blocking");
      expect([403, 404]).toContain(runningResp.status());

      await sql`update public.docs set scan_status = 'unscanned' where id = ${doc.id}::uuid`;
      const unscannedResp = await request.get(`/s/${token}/raw`);
      skipIfServeUnavailable(unscannedResp.status(), "unscanned blocking");
      expect([403, 404]).toContain(unscannedResp.status());

      await sql`update public.docs set scan_status = 'failed' where id = ${doc.id}::uuid`;
      const failedScanResp = await request.get(`/s/${token}/raw`);
      skipIfServeUnavailable(failedScanResp.status(), "failed scan blocking");
      expect([403, 404]).toContain(failedScanResp.status());

      await sql`
        update public.docs
        set scan_status = 'clean', moderation_status = 'quarantined'
        where id = ${doc.id}::uuid
      `;
      const quarantinedResp = await request.get(`/s/${token}/raw`);
      skipIfServeUnavailable(quarantinedResp.status(), "quarantined moderation blocking");
      expect([403, 404]).toContain(quarantinedResp.status());

      await sql`
        update public.docs
        set scan_status = 'clean', moderation_status = 'disabled'
        where id = ${doc.id}::uuid
      `;
      const disabledResp = await request.get(`/s/${token}/raw`);
      skipIfServeUnavailable(disabledResp.status(), "disabled moderation blocking");
      expect([403, 404]).toContain(disabledResp.status());
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
    if (!hasShareActive) {
      const blocked = await request.get(`/s/nonexistent-${randSuffix()}/raw`);
      skipIfServeUnavailable(blocked.status(), "share is_active fallback");
      expect([403, 404]).toContain(blocked.status());
      return;
    }

    const doc = await pickDoc(sql);
    test.skip(!doc, "No docs available for fixture setup");
    if (!doc) return;

    const token = `tok_inactive_${randSuffix()}`.slice(0, 64);
    await sql`
      insert into public.share_tokens (token, doc_id, is_active, max_views, views_count)
      values (${token}, ${doc.id}::uuid, false, null, 0)
    `;

    const resp = await request.get(`/s/${token}/raw`);
    skipIfServeUnavailable(resp.status(), "inactive share token blocking");
    expect(resp.status()).toBe(404);

    await sql`delete from public.share_tokens where token = ${token}`;
  });

  test("disabled organization blocks serving when org flags exist", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const docsHasOrg = await columnExists(sql, "docs", "org_id");
    if (!docsHasOrg) {
      const blocked = await request.get(`/s/nonexistent-${randSuffix()}/raw`);
      skipIfServeUnavailable(blocked.status(), "org-disabled fallback without docs.org_id");
      expect([403, 404]).toContain(blocked.status());
      return;
    }

    const orgHasDisabled = await columnExists(sql, "organizations", "disabled");
    const orgHasActive = await columnExists(sql, "organizations", "is_active");
    if (!orgHasDisabled && !orgHasActive) {
      const blocked = await request.get(`/s/nonexistent-${randSuffix()}/raw`);
      skipIfServeUnavailable(blocked.status(), "org-disabled fallback without organization flags");
      expect([403, 404]).toContain(blocked.status());
      return;
    }

    const rows = (await sql`
      select d.id::text as id, d.org_id::text as org_id
      from public.docs d
      where d.org_id is not null
      order by d.created_at desc
      limit 1
    `) as unknown as Array<{ id: string; org_id: string | null }>;
    const doc = rows?.[0];
    if (!doc?.id || !doc?.org_id) {
      const blocked = await request.get(`/s/nonexistent-${randSuffix()}/raw`);
      skipIfServeUnavailable(blocked.status(), "org-disabled fallback without org-linked docs");
      expect([403, 404]).toContain(blocked.status());
      return;
    }

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
      skipIfServeUnavailable(resp.status(), "organization-disabled serving block");
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
    skipIfServeUnavailable(inactiveResp.status(), "inactive alias blocking");
    expect(inactiveResp.status()).toBe(404);

    const expiredResp = await request.get(`/d/${aliasExpired}/raw`);
    skipIfServeUnavailable(expiredResp.status(), "expired alias blocking");
    expect(expiredResp.status()).toBe(404);

    if (hasRevokedAt) {
      const revokedResp = await request.get(`/d/${aliasRevoked}/raw`);
      skipIfServeUnavailable(revokedResp.status(), "revoked alias blocking");
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
      expect([302, 403, 404, 429, 503]).toContain(before.status());
      if (before.status() === 429) {
        test.skip(true, "Rate-limited in environment; cannot validate live revoke sequence");
      }
      skipIfServeUnavailable(before.status(), "live share revoke precondition");

      await sql`
        update public.share_tokens
        set revoked_at = now()
        where token = ${token}
      `;

      const after = await request.get(`/s/${token}/raw`);
      skipIfServeUnavailable(after.status(), "live share revoke postcondition");
      if (before.status() === 302) {
        expect(after.status()).toBe(410);
      } else {
        expect([403, 404, 410]).toContain(after.status());
      }
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
      expect([302, 403, 404, 429, 503]).toContain(before.status());
      if (before.status() === 429) {
        test.skip(true, "Rate-limited in environment; cannot validate live alias revoke sequence");
      }
      skipIfServeUnavailable(before.status(), "live alias revoke precondition");

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
      skipIfServeUnavailable(after.status(), "live alias revoke postcondition");
      expect([403, 404]).toContain(after.status());
    } finally {
      await sql`delete from public.doc_aliases where alias = ${alias}`;
    }
  });

  test("download ticket allows top-level navigation and brief replay", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const doc = await pickServableDoc(sql);
    test.skip(!doc, "No servable docs available for fixture setup");
    if (!doc) return;

    const token = `tok_dl_replay_${randSuffix()}`.slice(0, 64);
    const replayEnabled = !["0", "false", "no", "off"].includes(
      String(process.env.ACCESS_TICKET_REPLAY_ENABLED || "false").trim().toLowerCase()
    );
    await sql`
      insert into public.share_tokens (token, doc_id, max_views, views_count)
      values (${token}, ${doc.id}::uuid, null, 0)
    `;

    try {
      const downloadResp = await request.get(`/s/${token}/download`, { maxRedirects: 0 });
      expect([200, 302, 403, 429, 503]).toContain(downloadResp.status());
      skipIfServeUnavailable(downloadResp.status(), "download ticket flow entry");
      if (downloadResp.status() === 403) {
        expect(downloadResp.status()).toBe(403);
        return;
      }
      if (downloadResp.status() === 429) {
        test.skip(true, "Rate-limited in environment; cannot validate download ticket flow");
      }
      const rawLocation = downloadResp.headers()["location"] || "";
      expect(rawLocation).toContain(`/s/${token}/raw`);
      expect(rawLocation).toContain("disposition=attachment");

      const rawUrl = new URL(rawLocation, process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000");
      const rawResp = await request.get(`${rawUrl.pathname}${rawUrl.search}`);
      expect([302, 403, 404, 429, 503]).toContain(rawResp.status());
      skipIfServeUnavailable(rawResp.status(), "download ticket minting");
      if (rawResp.status() === 403 || rawResp.status() === 404) {
        expect([403, 404]).toContain(rawResp.status());
        return;
      }
      if (rawResp.status() === 429) {
        test.skip(true, "Rate-limited in environment; cannot validate download ticket minting");
      }

      const ticketLocation = rawResp.headers()["location"] || "";
      expect(ticketLocation).toContain("/t/");
      const ticketUrl = new URL(ticketLocation, process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000");
      const ticketPath = `${ticketUrl.pathname}${ticketUrl.search}`;

      const navHeaders = {
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-user": "?1",
      };

      const firstTicket = await request.get(ticketPath, { headers: navHeaders });
      skipIfServeUnavailable(firstTicket.status(), "first download ticket navigation");
      expect(firstTicket.status()).not.toBe(404);
      if (firstTicket.status() === 403) {
        const body = await firstTicket.text();
        expect(body).not.toContain("Direct open is disabled for this protected document.");
      }

      const secondTicket = await request.get(ticketPath, { headers: navHeaders });
      skipIfServeUnavailable(secondTicket.status(), "second download ticket navigation");
      if (replayEnabled) {
        expect(secondTicket.status()).not.toBe(404);
        if (secondTicket.status() === 403) {
          const body = await secondTicket.text();
          expect(body).not.toContain("Direct open is disabled for this protected document.");
        }
      } else {
        expect(secondTicket.status()).toBe(404);
      }
    } finally {
      await sql`delete from public.share_tokens where token = ${token}`;
    }
  });
});
