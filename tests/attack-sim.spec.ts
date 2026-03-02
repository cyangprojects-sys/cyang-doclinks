import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import crypto from "node:crypto";
import { neon } from "@neondatabase/serverless";

type Sql = ReturnType<typeof neon<false, false>>;

function isBlockedStatus(status: number): boolean {
  return (
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 410 ||
    status === 429 ||
    status === 500 ||
    status === 503
  );
}

function stripeSignature(payload: unknown, secret: string, timestamp?: number): string {
  const ts = Number.isFinite(timestamp) ? Number(timestamp) : Math.floor(Date.now() / 1000);
  const raw = JSON.stringify(payload);
  const v1 = crypto.createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
  return `t=${ts},v1=${v1}`;
}

function randSuffix(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function authHeadersFromEnv(): Record<string, string> | null {
  const cookie = String(process.env.ATTACK_TEST_AUTH_COOKIE || "").trim();
  if (!cookie) return null;
  return { cookie };
}

function encryptForUpload(plain: Buffer, keyB64: string, ivB64: string): Buffer {
  const key = Buffer.from(keyB64, "base64");
  const iv = Buffer.from(ivB64, "base64");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const out = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([out, tag]);
}

async function presignUpload(
  request: APIRequestContext,
  headers: Record<string, string>,
  args: { filename: string; sizeBytes: number }
): Promise<{
  doc_id: string;
  upload_url: string;
  r2_key: string;
  bucket: string;
  encryption: { enabled: true; alg: string | null; iv_b64: string | null; data_key_b64: string | null };
}> {
  const res = await request.post("/api/admin/upload/presign", {
    headers: { "content-type": "application/json", ...headers },
    data: {
      title: args.filename,
      filename: args.filename,
      contentType: "application/pdf",
      sizeBytes: args.sizeBytes,
      encrypt: true,
    },
  });

  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(json?.ok).toBeTruthy();
  return json;
}

async function pickDocId(sql: Sql): Promise<string | null> {
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

test.describe("attack simulation", () => {
  test("raw docId access is not a public capability", async ({ request }) => {
    const r = await request.get("/serve/00000000-0000-0000-0000-000000000000");
    expect([403, 404, 429, 503]).toContain(r.status());
  });

  test("invalid share token cannot be used for raw serving", async ({ request }) => {
    const r = await request.get("/s/not-a-real-token/raw");
    expect(isBlockedStatus(r.status())).toBeTruthy();
  });

  test("invalid alias cannot be used for raw serving", async ({ request }) => {
    const r = await request.get("/d/not-a-real-alias/raw");
    expect(isBlockedStatus(r.status())).toBeTruthy();
  });

  test("ticket endpoint blocks direct top-level open attempts", async ({ request }) => {
    const r = await request.get("/t/not-a-real-ticket", {
      headers: {
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-user": "?1",
      },
    });
    expect([403, 503]).toContain(r.status());
  });

  test("high-frequency alias guesses are throttled or blocked", async ({ request }) => {
    const statuses: number[] = [];
    for (let i = 0; i < 45; i += 1) {
      const r = await request.get(`/d/guess-${i}/raw`);
      statuses.push(r.status());
    }
    const sawThrottle = statuses.includes(429);
    const allBlocked = statuses.every((s) => isBlockedStatus(s) || s === 500);
    expect(sawThrottle || allBlocked).toBeTruthy();
  });

  test("high-frequency token guesses are throttled or blocked", async ({ request }) => {
    const statuses: number[] = [];
    for (let i = 0; i < 45; i += 1) {
      const r = await request.get(`/s/guess-token-${i}/raw`);
      statuses.push(r.status());
    }
    const sawThrottle = statuses.includes(429);
    const allBlocked = statuses.every((s) => isBlockedStatus(s) || s === 500);
    expect(sawThrottle || allBlocked).toBeTruthy();
  });

  test("attempt serve before scan finishes is blocked", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const docId = await pickDocId(sql);
    test.skip(!docId, "No doc available for fixture setup");
    if (!docId) return;

    const token = `tok_attack_prescan_${randSuffix()}`.slice(0, 64);
    await sql`
      insert into public.share_tokens (token, doc_id, max_views, views_count)
      values (${token}, ${docId}::uuid, null, 0)
    `;

    const before = (await sql`
      select
        coalesce(scan_status::text, 'unscanned') as scan_status,
        coalesce(moderation_status::text, 'active') as moderation_status,
        coalesce(risk_level::text, 'low') as risk_level
      from public.docs
      where id = ${docId}::uuid
      limit 1
    `) as unknown as Array<{
      scan_status: string;
      moderation_status: string;
      risk_level: string;
    }>;

    try {
      await sql`update public.docs set scan_status = 'queued' where id = ${docId}::uuid`;
      const r = await request.get(`/s/${token}/raw`);
      expect([404, 429]).toContain(r.status());
    } finally {
      if (before?.[0]) {
        await sql`
          update public.docs
          set
            scan_status = ${before[0].scan_status},
            moderation_status = ${before[0].moderation_status},
            risk_level = ${before[0].risk_level}
          where id = ${docId}::uuid
        `;
      }
      await sql`delete from public.share_tokens where token = ${token}`;
    }
  });

  test("forged tenant header does not grant raw doc access", async ({ request }) => {
    const fakeDocId = "00000000-0000-0000-0000-000000000000";
    const r = await request.get(`/serve/${fakeDocId}`, {
      headers: {
        "x-org-id": "00000000-0000-0000-0000-000000000001",
        "x-tenant-id": "forged-tenant",
      },
    });
    expect([403, 404, 429, 503]).toContain(r.status());
  });

  test("serve route with real docId still requires privileged auth", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const docId = await pickDocId(sql);
    test.skip(!docId, "No doc available for fixture setup");
    if (!docId) return;

    const r = await request.get(`/serve/${docId}`);
    if (r.status() === 429) {
      test.skip(true, "Rate limited in environment");
    }
    expect(r.status()).toBe(403);
  });

  test("serve route rejects mismatched docId even with a valid token", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const docId = await pickDocId(sql);
    test.skip(!docId, "No doc available for fixture setup");
    if (!docId) return;

    const token = `tok_attack_docid_mismatch_${randSuffix()}`.slice(0, 64);
    await sql`
      insert into public.share_tokens (token, doc_id, max_views, views_count)
      values (${token}, ${docId}::uuid, null, 0)
    `;

    try {
      const wrongDocId = "00000000-0000-0000-0000-000000000000";
      const r = await request.get(`/serve/${wrongDocId}?token=${encodeURIComponent(token)}`);
      if (r.status() === 429) {
        test.skip(true, "Rate limited in environment");
      }
      expect(r.status()).toBe(404);
    } finally {
      await sql`delete from public.share_tokens where token = ${token}`;
    }
  });

  test("serve route rejects mismatched docId even with a valid alias", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const hasDocAliases = await tableExists(sql, "doc_aliases");
    test.skip(!hasDocAliases, "doc_aliases table not available");

    const docId = await pickDocId(sql);
    test.skip(!docId, "No doc available for fixture setup");
    if (!docId) return;

    const alias = `a-serve-mismatch-${randSuffix()}`.toLowerCase();
    await sql`
      insert into public.doc_aliases (alias, doc_id, is_active, expires_at)
      values (${alias}, ${docId}::uuid, true, null)
    `;

    try {
      const wrongDocId = "00000000-0000-0000-0000-000000000000";
      const r = await request.get(`/serve/${wrongDocId}?alias=${encodeURIComponent(alias)}`);
      if (r.status() === 429) {
        test.skip(true, "Rate limited in environment");
      }
      expect(r.status()).toBe(404);
    } finally {
      await sql`delete from public.doc_aliases where alias = ${alias}`;
    }
  });

  test("share raw path does not expose direct object-store URL", async ({ request }) => {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!databaseUrl, "DATABASE_URL not available");
    const sql = neon(databaseUrl);

    const docId = await pickDocId(sql);
    test.skip(!docId, "No doc available for fixture setup");
    if (!docId) return;

    const token = `tok_attack_redirect_${randSuffix()}`.slice(0, 64);
    await sql`
      insert into public.share_tokens (token, doc_id, max_views, views_count)
      values (${token}, ${docId}::uuid, null, 0)
    `;

    try {
      const r = await request.get(`/s/${token}/raw`, {
        maxRedirects: 0,
      });
      if (r.status() === 429) test.skip(true, "Rate limited in environment");
      expect(r.status()).toBe(302);
      const loc = r.headers()["location"] || "";
      expect(loc).toContain("/t/");
      expect(loc).not.toContain(".r2.");
      expect(loc).not.toContain("amazonaws.com");
    } finally {
      await sql`delete from public.share_tokens where token = ${token}`;
    }
  });

  test("upload presign rejects absolute oversize payloads (>25MB)", async ({ request }) => {
    const auth = authHeadersFromEnv();
    test.skip(!auth, "ATTACK_TEST_AUTH_COOKIE not configured");
    if (!auth) return;

    const absMax = Number(process.env.UPLOAD_ABSOLUTE_MAX_BYTES || 26_214_400);
    const tooLarge = absMax + 1;
    const res = await request.post("/api/admin/upload/presign", {
      headers: { "content-type": "application/json", ...auth },
      data: {
        title: "oversize.pdf",
        filename: "oversize.pdf",
        contentType: "application/pdf",
        sizeBytes: tooLarge,
        encrypt: true,
      },
    });

    expect(res.status()).toBe(413);
    const body = await res.json();
    expect(body?.ok).toBeFalsy();
    expect(String(body?.error || "")).toContain("FILE_TOO_LARGE");
  });

  test("upload complete rejects malformed PDF after decrypt", async ({ request }) => {
    const auth = authHeadersFromEnv();
    test.skip(!auth, "ATTACK_TEST_AUTH_COOKIE not configured");
    if (!auth) return;

    const fakePdfName = `malformed-${randSuffix()}.pdf`;
    const badPlain = Buffer.from("this is not a real pdf");

    const p = await presignUpload(request, auth, {
      filename: fakePdfName,
      sizeBytes: badPlain.length,
    });

    expect(p?.encryption?.enabled).toBeTruthy();
    expect(p?.encryption?.data_key_b64).toBeTruthy();
    expect(p?.encryption?.iv_b64).toBeTruthy();

    const ciphertext = encryptForUpload(
      badPlain,
      String(p.encryption.data_key_b64),
      String(p.encryption.iv_b64)
    );

    const put = await request.fetch(p.upload_url, {
      method: "PUT",
      headers: {
        "content-type": "application/octet-stream",
        "x-amz-meta-doc-id": p.doc_id,
        "x-amz-meta-orig-content-type": "application/pdf",
      },
      data: ciphertext,
    });
    expect(put.status()).toBeGreaterThanOrEqual(200);
    expect(put.status()).toBeLessThan(300);

    const complete = await request.post("/api/admin/upload/complete", {
      headers: { "content-type": "application/json", ...auth },
      data: {
        doc_id: p.doc_id,
        title: fakePdfName,
        original_filename: fakePdfName,
        r2_bucket: p.bucket,
        r2_key: p.r2_key,
      },
    });

    expect(complete.status()).toBe(409);
    const body = await complete.json();
    expect(body?.ok).toBeFalsy();
    expect(String(body?.error || "")).toContain("NOT_PDF");
  });

  test("upload complete rejects PDFs that exceed max page policy", async ({ request }) => {
    const auth = authHeadersFromEnv();
    test.skip(!auth, "ATTACK_TEST_AUTH_COOKIE not configured");
    if (!auth) return;

    const maxPages = Number(process.env.PDF_MAX_PAGES || 2000);
    const overPages = maxPages + 25;
    const fakePdfName = `too-many-pages-${randSuffix()}.pdf`;
    const repeatedPages = new Array(overPages).fill("/Type /Page").join("\n");
    const pseudoPdf = Buffer.from(`%PDF-1.7\n${repeatedPages}\n%%EOF\n`);

    const p = await presignUpload(request, auth, {
      filename: fakePdfName,
      sizeBytes: pseudoPdf.length,
    });

    const ciphertext = encryptForUpload(
      pseudoPdf,
      String(p.encryption.data_key_b64),
      String(p.encryption.iv_b64)
    );

    const put = await request.fetch(p.upload_url, {
      method: "PUT",
      headers: {
        "content-type": "application/octet-stream",
        "x-amz-meta-doc-id": p.doc_id,
        "x-amz-meta-orig-content-type": "application/pdf",
      },
      data: ciphertext,
    });
    expect(put.status()).toBeGreaterThanOrEqual(200);
    expect(put.status()).toBeLessThan(300);

    const complete = await request.post("/api/admin/upload/complete", {
      headers: { "content-type": "application/json", ...auth },
      data: {
        doc_id: p.doc_id,
        title: fakePdfName,
        original_filename: fakePdfName,
        r2_bucket: p.bucket,
        r2_key: p.r2_key,
      },
    });

    expect(complete.status()).toBe(409);
    const body = await complete.json();
    expect(body?.ok).toBeFalsy();
    expect(String(body?.message || "").toLowerCase()).toContain("page");
  });

  test("upload presign route throttles high-frequency abuse", async ({ request }) => {
    const auth = authHeadersFromEnv();
    test.skip(!auth, "ATTACK_TEST_AUTH_COOKIE not configured");
    if (!auth) return;

    const statuses: number[] = [];
    for (let i = 0; i < 45; i += 1) {
      const r = await request.post("/api/admin/upload/presign", {
        headers: { "content-type": "application/json", ...auth },
        data: {
          filename: `throttle-${i}.txt`,
          contentType: "text/plain",
          sizeBytes: 1024,
          encrypt: true,
        },
      });
      statuses.push(r.status());
    }
    const sawThrottle = statuses.includes(429);
    const allBlocked = statuses.every((s) => s >= 400 && s < 600);
    expect(sawThrottle || allBlocked).toBeTruthy();
  });

  test("upload complete route throttles high-frequency abuse", async ({ request }) => {
    const statuses: number[] = [];
    for (let i = 0; i < 45; i += 1) {
      const r = await request.post("/api/admin/upload/complete", {
        headers: { "content-type": "application/json" },
        data: { doc_id: "" },
      });
      statuses.push(r.status());
    }
    const sawThrottle = statuses.includes(429);
    const allBlocked = statuses.every((s) => s >= 400 && s < 600);
    expect(sawThrottle || allBlocked).toBeTruthy();
  });

  test("stripe webhook rejects invalid signatures", async ({ request }) => {
    const body = {
      id: "evt_attack_sim_invalid_sig",
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_fake",
          subscription: "sub_fake",
        },
      },
    };

    const r = await request.post("/api/stripe/webhook", {
      data: body,
      headers: {
        "stripe-signature": "t=1700000000,v1=deadbeef",
      },
    });
    expect([400, 403, 429, 503]).toContain(r.status());
  });

  test("stripe webhook rejects missing signature header", async ({ request }) => {
    const r = await request.post("/api/stripe/webhook", {
      data: {
        id: "evt_attack_sim_missing_sig",
        type: "invoice.payment_failed",
        data: { object: { customer: "cus_fake", subscription: "sub_fake" } },
      },
    });
    expect([400, 403, 429, 503]).toContain(r.status());
  });

  test("stripe webhook dedupes duplicate events (when secret configured)", async ({ request }) => {
    const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
    test.skip(!webhookSecret, "STRIPE_WEBHOOK_SECRET not available in test runtime");

    const payload = {
      id: `evt_attack_sim_dupe_${Date.now()}`,
      type: "billing.test.unhandled",
      data: { object: {} },
    };
    const sig = stripeSignature(payload, webhookSecret);

    const first = await request.post("/api/stripe/webhook", {
      data: payload,
      headers: { "stripe-signature": sig },
    });
    // If billing tables are unavailable in this environment, route should be explicit and deterministic.
    expect([200, 503]).toContain(first.status());

    const second = await request.post("/api/stripe/webhook", {
      data: payload,
      headers: { "stripe-signature": sig },
    });

    if (first.status() === 503) {
      expect(second.status()).toBe(503);
      return;
    }

    expect(second.status()).toBe(200);
    const body = await second.json();
    expect(body?.ok).toBeTruthy();
    expect(body?.duplicate).toBeTruthy();
  });

  test("stripe webhook accepts signed invoice.payment_failed payloads", async ({ request }) => {
    const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
    test.skip(!webhookSecret, "STRIPE_WEBHOOK_SECRET not available in test runtime");

    const payload = {
      id: `evt_attack_sim_payment_failed_${Date.now()}`,
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_attack_sim",
          subscription: "sub_attack_sim",
        },
      },
    };
    const sig = stripeSignature(payload, webhookSecret);

    const r = await request.post("/api/stripe/webhook", {
      data: payload,
      headers: { "stripe-signature": sig },
    });
    expect([200, 503]).toContain(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body?.ok).toBeTruthy();
    }
  });

  test("stripe webhook accepts signed invoice.payment_succeeded payloads", async ({ request }) => {
    const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
    test.skip(!webhookSecret, "STRIPE_WEBHOOK_SECRET not available in test runtime");

    const payload = {
      id: `evt_attack_sim_payment_succeeded_${Date.now()}`,
      type: "invoice.payment_succeeded",
      data: {
        object: {
          customer: "cus_attack_sim",
          subscription: "sub_attack_sim",
        },
      },
    };
    const sig = stripeSignature(payload, webhookSecret);

    const r = await request.post("/api/stripe/webhook", {
      data: payload,
      headers: { "stripe-signature": sig },
    });
    expect([200, 503]).toContain(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body?.ok).toBeTruthy();
    }
  });
});
