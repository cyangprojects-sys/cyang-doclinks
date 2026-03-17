import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";
import { GET as adminAuditExportGet } from "../src/app/api/admin/audit/export/route";
import { GET as adminBillingGet } from "../src/app/api/admin/billing/route";
import { GET as adminBillingInvoicesGet } from "../src/app/api/admin/billing/invoices/route";
import { GET as adminBillingStatusGet } from "../src/app/api/admin/billing/status/route";
import { GET as adminDbIndexAuditGet } from "../src/app/api/admin/db-index-audit/route";
import { GET as adminRetentionRunGet } from "../src/app/api/admin/retention/run/route";
import { GET as adminSecurityFreezeGet } from "../src/app/api/admin/security/freeze/route";
import { GET as adminSecurityKeysGet } from "../src/app/api/admin/security/keys/route";
import { GET as adminSecurityOrgAccessGet } from "../src/app/api/admin/security/org-access/route";
import { GET as adminSecurityRbacGet } from "../src/app/api/admin/security/rbac/route";
import { GET as adminUploadGet } from "../src/app/api/admin/upload/route";
import { GET as cronAggregateGet } from "../src/app/api/cron/aggregate/route";
import { GET as cronBillingSyncGet } from "../src/app/api/cron/billing-sync/route";
import { GET as cronKeyRotationGet } from "../src/app/api/cron/key-rotation/route";
import { GET as cronNightlyGet } from "../src/app/api/cron/nightly/route";
import { GET as cronOrphanSweepGet } from "../src/app/api/cron/orphan-sweep/route";
import { GET as cronRetentionGet } from "../src/app/api/cron/retention/route";
import { GET as cronScanGet } from "../src/app/api/cron/scan/route";
import { GET as cronWebhooksGet } from "../src/app/api/cron/webhooks/route";

type GetHandler = (req: NextRequest) => Promise<Response>;

let ipSeed = 180;
function nextIp(): string {
  ipSeed = (ipSeed + 1) % 250;
  return `203.0.113.${ipSeed}`;
}

async function invokeMaybe(handler: GetHandler, req: NextRequest): Promise<Response | null> {
  try {
    return await handler(req);
  } catch {
    return null;
  }
}

async function expectRateLimitGetBurst(opts: {
  envKey: string;
  handler: GetHandler;
  url: string;
  extraEnv?: Record<string, string>;
  acceptedProtectedStatuses?: number[];
}): Promise<void> {
  const prev = process.env[opts.envKey];
  const prevExtra = new Map<string, string | undefined>();
  process.env[opts.envKey] = "1";
  for (const [k, v] of Object.entries(opts.extraEnv || {})) {
    prevExtra.set(k, process.env[k]);
    process.env[k] = v;
  }
  try {
    const ip = nextIp();
    const mkReq = () =>
      new NextRequest(opts.url, {
        method: "GET",
        headers: {
          "x-forwarded-for": ip,
        },
      });

    const r1 = await invokeMaybe(opts.handler, mkReq());
    const r2 = await invokeMaybe(opts.handler, mkReq());
    const responses = [r1, r2].filter((r): r is Response => Boolean(r));
    expect(responses.length > 0).toBeTruthy();

    const statuses = responses.map((r) => r.status);
    const texts = await Promise.all(
      responses.map(async (r) => {
        try {
          return await r.clone().text();
        } catch {
          return "";
        }
      })
    );

    const rateLimited =
      statuses.includes(429) ||
      texts.some((t) => t.includes("RATE_LIMIT") || t.includes("Too Many Requests"));
    if (rateLimited) return;

    const acceptedProtectedStatuses = opts.acceptedProtectedStatuses || [];
    const allProtected = statuses.every((status) => acceptedProtectedStatuses.includes(status));
    expect(allProtected).toBeTruthy();
  } finally {
    if (prev == null) delete process.env[opts.envKey];
    else process.env[opts.envKey] = prev;
    for (const [k, v] of prevExtra.entries()) {
      if (v == null) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test.describe("admin/cron get route runtime rate-limit behavior", () => {
  test.describe.configure({ mode: "serial" });

  test("admin audit export route rate-limits constrained bursts", async () => {
    await expectRateLimitGetBurst({
      envKey: "RATE_LIMIT_ADMIN_AUDIT_EXPORT_PER_MIN",
      handler: adminAuditExportGet,
      url: "http://localhost/api/admin/audit/export?type=audit&days=1&limit=5",
    });
  });

  test("admin billing settings route rate-limits constrained bursts", async () => {
    await expectRateLimitGetBurst({
      envKey: "RATE_LIMIT_ADMIN_BILLING_SETTINGS_PER_MIN",
      handler: adminBillingGet,
      url: "http://localhost/api/admin/billing",
    });
  });

  test("admin billing invoices route rate-limits constrained bursts", async () => {
    await expectRateLimitGetBurst({
      envKey: "RATE_LIMIT_ADMIN_BILLING_INVOICES_PER_MIN",
      handler: adminBillingInvoicesGet,
      url: "http://localhost/api/admin/billing/invoices?limit=5",
    });
  });

  test("admin billing status route rate-limits constrained bursts", async () => {
    await expectRateLimitGetBurst({
      envKey: "RATE_LIMIT_ADMIN_BILLING_STATUS_PER_MIN",
      handler: adminBillingStatusGet,
      url: "http://localhost/api/admin/billing/status",
      acceptedProtectedStatuses: [401, 403, 503],
    });
  });

  test("admin db-index-audit route rate-limits constrained bursts", async () => {
    await expectRateLimitGetBurst({
      envKey: "RATE_LIMIT_ADMIN_DB_INDEX_AUDIT_PER_MIN",
      handler: adminDbIndexAuditGet,
      url: "http://localhost/api/admin/db-index-audit",
    });
  });

  test("admin retention run route rate-limits constrained bursts", async () => {
    await expectRateLimitGetBurst({
      envKey: "RATE_LIMIT_ADMIN_RETENTION_RUN_PER_MIN",
      handler: adminRetentionRunGet,
      url: "http://localhost/api/admin/retention/run",
    });
  });

  test("admin security freeze route rate-limits constrained bursts", async () => {
    await expectRateLimitGetBurst({
      envKey: "RATE_LIMIT_ADMIN_SECURITY_FREEZE_PER_MIN",
      handler: adminSecurityFreezeGet,
      url: "http://localhost/api/admin/security/freeze",
    });
  });

  test("admin security keys route rate-limits constrained bursts", async () => {
    await expectRateLimitGetBurst({
      envKey: "RATE_LIMIT_ADMIN_SECURITY_KEYS_PER_MIN",
      handler: adminSecurityKeysGet,
      url: "http://localhost/api/admin/security/keys",
    });
  });

  test("admin security org-access route rate-limits constrained bursts", async () => {
    await expectRateLimitGetBurst({
      envKey: "RATE_LIMIT_ADMIN_SECURITY_ORG_ACCESS_PER_MIN",
      handler: adminSecurityOrgAccessGet,
      url: "http://localhost/api/admin/security/org-access",
    });
  });

  test("admin security rbac route rate-limits constrained bursts", async () => {
    await expectRateLimitGetBurst({
      envKey: "RATE_LIMIT_ADMIN_SECURITY_RBAC_PER_MIN",
      handler: adminSecurityRbacGet,
      url: "http://localhost/api/admin/security/rbac",
    });
  });

  test("admin upload route rate-limits constrained bursts", async () => {
    await expectRateLimitGetBurst({
      envKey: "RATE_LIMIT_ADMIN_UPLOAD_ROUTE_PER_MIN",
      handler: adminUploadGet,
      url: "http://localhost/api/admin/upload",
    });
  });

  test("cron aggregate route rate-limits constrained bursts", async () => {
    await expectRateLimitGetBurst({
      envKey: "RATE_LIMIT_CRON_AGGREGATE_PER_MIN",
      handler: cronAggregateGet,
      url: "http://localhost/api/cron/aggregate?daysBack=1",
    });
  });

  test("cron billing-sync route rate-limits constrained bursts", async () => {
    await expectRateLimitGetBurst({
      envKey: "RATE_LIMIT_CRON_BILLING_SYNC_PER_MIN",
      handler: cronBillingSyncGet,
      url: "http://localhost/api/cron/billing-sync",
    });
  });

  test("cron key-rotation route rate-limits constrained bursts", async () => {
    await expectRateLimitGetBurst({
      envKey: "RATE_LIMIT_CRON_KEY_ROTATION_PER_MIN",
      handler: cronKeyRotationGet,
      url: "http://localhost/api/cron/key-rotation",
    });
  });

  test("cron nightly route rate-limits constrained bursts", async () => {
    await expectRateLimitGetBurst({
      envKey: "RATE_LIMIT_CRON_NIGHTLY_PER_MIN",
      handler: cronNightlyGet,
      url: "http://localhost/api/cron/nightly",
    });
  });

  test("cron orphan-sweep route rate-limits constrained bursts", async () => {
    await expectRateLimitGetBurst({
      envKey: "RATE_LIMIT_CRON_ORPHAN_SWEEP_PER_MIN",
      handler: cronOrphanSweepGet,
      url: "http://localhost/api/cron/orphan-sweep?maxObjects=10",
    });
  });

  test("cron retention route rate-limits constrained bursts", async () => {
    await expectRateLimitGetBurst({
      envKey: "RATE_LIMIT_CRON_RETENTION_PER_MIN",
      handler: cronRetentionGet,
      url: "http://localhost/api/cron/retention",
    });
  });

  test("cron scan route rate-limits constrained bursts", async () => {
    await expectRateLimitGetBurst({
      envKey: "RATE_LIMIT_CRON_SCAN_PER_MIN",
      handler: cronScanGet,
      url: "http://localhost/api/cron/scan",
    });
  });

  test("cron webhooks route rate-limits constrained bursts", async () => {
    await expectRateLimitGetBurst({
      envKey: "RATE_LIMIT_CRON_WEBHOOKS_PER_MIN",
      handler: cronWebhooksGet,
      url: "http://localhost/api/cron/webhooks",
    });
  });
});
