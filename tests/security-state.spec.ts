import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import crypto from "node:crypto";

type Sql = ReturnType<typeof neon<false, false>>;

function randSuffix(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
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
  test("top-level raw navigation is blocked while non-navigation raw access can mint a ticket", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const doc = await pickServableDoc(sql);
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
      expect(topLevelResp.status()).toBe(403);

      const nonTopLevelResp = await request.get(`/s/${token}/raw`, { maxRedirects: 0 });
      if (nonTopLevelResp.status() === 429) {
        test.skip(true, "Rate-limited in environment; cannot validate non-top-level raw access");
      }
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
      expect(resp.status()).toBe(401);
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
      expect(resp.status()).toBe(403);
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
      expect(inlineResp.status()).toBe(403);

      const attachmentResp = await request.get(`/s/${token}/raw?disposition=attachment`, { maxRedirects: 0 });
      if (attachmentResp.status() === 429) {
        test.skip(true, "Rate-limited in environment; cannot validate risky attachment fallback");
      }
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
    const hasAliasPassword = await columnExists(sql, "doc_aliases", "password_hash");
    test.skip(!hasDocAliases || !hasAliasPassword, "doc_aliases.password_hash not available");

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
    const hasAliasPassword = await columnExists(sql, "doc_aliases", "password_hash");
    test.skip(!hasDocAliases || !hasAliasPassword, "doc_aliases.password_hash not available");

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
      expect(resp.status()).toBe(302);
      expect(resp.headers()["location"] || "").toBe(`/d/${encodeURIComponent(alias)}`);
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

  test("download ticket allows top-level navigation and brief replay", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const doc = await pickServableDoc(sql);
    test.skip(!doc, "No servable docs available for fixture setup");
    if (!doc) return;

    const token = `tok_dl_replay_${randSuffix()}`.slice(0, 64);
    await sql`
      insert into public.share_tokens (token, doc_id, max_views, views_count)
      values (${token}, ${doc.id}::uuid, null, 0)
    `;

    try {
      const downloadResp = await request.get(`/s/${token}/download`);
      expect([302, 429]).toContain(downloadResp.status());
      if (downloadResp.status() === 429) {
        test.skip(true, "Rate-limited in environment; cannot validate download ticket flow");
      }
      const rawLocation = downloadResp.headers()["location"] || "";
      expect(rawLocation).toContain(`/s/${token}/raw`);
      expect(rawLocation).toContain("disposition=attachment");

      const rawUrl = new URL(rawLocation, process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000");
      const rawResp = await request.get(`${rawUrl.pathname}${rawUrl.search}`);
      expect([302, 429]).toContain(rawResp.status());
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
      expect(firstTicket.status()).not.toBe(404);
      if (firstTicket.status() === 403) {
        const body = await firstTicket.text();
        expect(body).not.toContain("Direct open is disabled for this protected document.");
      }

      const secondTicket = await request.get(ticketPath, { headers: navHeaders });
      expect(secondTicket.status()).not.toBe(404);
      if (secondTicket.status() === 403) {
        const body = await secondTicket.text();
        expect(body).not.toContain("Direct open is disabled for this protected document.");
      }
    } finally {
      await sql`delete from public.share_tokens where token = ${token}`;
    }
  });
});
