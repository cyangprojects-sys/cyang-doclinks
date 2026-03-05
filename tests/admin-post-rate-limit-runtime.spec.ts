import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";
import { POST as activatePost } from "../src/app/api/admin/security/activate/route";
import { POST as freezePost } from "../src/app/api/admin/security/freeze/route";
import { POST as billingSettingsPost } from "../src/app/api/admin/billing/route";
import { POST as uploadAbortPost } from "../src/app/api/admin/upload/abort/route";
import { POST as adminAbusePost } from "../src/app/api/admin/abuse/route";
import { POST as adminDmcaPost } from "../src/app/api/admin/dmca/route";
import { POST as uploadPresignPost } from "../src/app/api/admin/upload/presign/route";
import { POST as uploadCompletePost } from "../src/app/api/admin/upload/complete/route";
import { POST as adminBillingCheckoutPost } from "../src/app/api/admin/billing/checkout/route";
import { POST as adminBillingPortalPost } from "../src/app/api/admin/billing/portal/route";
import { POST as adminBillingSyncPost } from "../src/app/api/admin/billing/sync/route";
import { POST as adminBillingViewOverridePost } from "../src/app/api/admin/billing/view-override/route";
import { POST as viewerBillingCheckoutPost } from "../src/app/api/billing/checkout/route";
import { POST as securityMigrateLegacyPost } from "../src/app/api/admin/security/migrate-legacy/route";
import { POST as securityOrgAccessPost } from "../src/app/api/admin/security/org-access/route";
import { POST as securityRbacPost } from "../src/app/api/admin/security/rbac/route";
import { POST as securityRequeueScansPost } from "../src/app/api/admin/security/requeue-scans/route";
import { POST as securityRevokePost } from "../src/app/api/admin/security/revoke/route";
import { POST as securityRollbackPost } from "../src/app/api/admin/security/rollback/route";
import { POST as securityRotatePost } from "../src/app/api/admin/security/rotate/route";
import { POST as securityTenantFreezePost } from "../src/app/api/admin/security/tenant-freeze/route";

let ipSeed = 120;
function nextIp(): string {
  ipSeed = (ipSeed + 1) % 250;
  return `203.0.113.${ipSeed}`;
}

async function expectRateLimitJsonBurst(opts: {
  envKey: string;
  handler: (req: NextRequest) => Promise<Response>;
  url: string;
  body?: string;
}): Promise<void> {
  const prev = process.env[opts.envKey];
  process.env[opts.envKey] = "1";
  try {
    const ip = nextIp();
    const body = opts.body ?? "{}";
    const mkReq = () =>
      new NextRequest(opts.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(body)),
          "x-forwarded-for": ip,
        },
        body,
      });
    const r1 = await opts.handler(mkReq());
    const r2 = await opts.handler(mkReq());
    const b1 = await r1.json().catch(() => ({}));
    const b2 = await r2.json().catch(() => ({}));
    const errors = [b1?.error, b2?.error];
    expect(errors.some((e) => e === "RATE_LIMIT" || e === "RATE_LIMITED")).toBeTruthy();
  } finally {
    if (prev == null) delete process.env[opts.envKey];
    else process.env[opts.envKey] = prev;
  }
}

async function expectRateLimitRedirectBurst(opts: {
  envKey: string;
  handler: (req: NextRequest) => Promise<Response>;
  url: string;
  body?: string;
}): Promise<void> {
  const prev = process.env[opts.envKey];
  process.env[opts.envKey] = "1";
  try {
    const ip = nextIp();
    const body = opts.body ?? "x=1";
    const mkReq = () =>
      new NextRequest(opts.url, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "content-length": String(Buffer.byteLength(body)),
          "x-forwarded-for": ip,
        },
        body,
      });
    const r1 = await opts.handler(mkReq());
    const r2 = await opts.handler(mkReq());
    const locations = [r1.headers.get("location") || "", r2.headers.get("location") || ""];
    expect(locations.some((l) => l.includes("error=RATE_LIMIT"))).toBeTruthy();
  } finally {
    if (prev == null) delete process.env[opts.envKey];
    else process.env[opts.envKey] = prev;
  }
}

test.describe("admin post route runtime rate-limit behavior", () => {
  test.describe.configure({ mode: "serial" });
  test("security activate route returns RATE_LIMIT for constrained burst", async () => {
    const prev = process.env.RATE_LIMIT_ADMIN_SECURITY_KEY_OPS_PER_MIN;
    process.env.RATE_LIMIT_ADMIN_SECURITY_KEY_OPS_PER_MIN = "1";
    try {
      const ip = nextIp();
      const req1 = new NextRequest("http://localhost/api/admin/security/activate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": "2",
          "x-forwarded-for": ip,
        },
        body: "{}",
      });
      const req2 = new NextRequest("http://localhost/api/admin/security/activate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": "2",
          "x-forwarded-for": ip,
        },
        body: "{}",
      });
      const r1 = await activatePost(req1);
      const r2 = await activatePost(req2);
      const b1 = await r1.json().catch(() => ({}));
      const b2 = await r2.json().catch(() => ({}));
      const rateLimited = [b1?.error, b2?.error].includes("RATE_LIMIT");
      expect(rateLimited).toBeTruthy();
    } finally {
      if (prev == null) delete process.env.RATE_LIMIT_ADMIN_SECURITY_KEY_OPS_PER_MIN;
      else process.env.RATE_LIMIT_ADMIN_SECURITY_KEY_OPS_PER_MIN = prev;
    }
  });

  test("security freeze route redirects with RATE_LIMIT for constrained burst", async () => {
    const prev = process.env.RATE_LIMIT_ADMIN_SECURITY_FREEZE_PER_MIN;
    process.env.RATE_LIMIT_ADMIN_SECURITY_FREEZE_PER_MIN = "1";
    try {
      const ip = nextIp();
      const mkReq = () =>
        new NextRequest("http://localhost/api/admin/security/freeze", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "content-length": "26",
            "x-forwarded-for": ip,
          },
          body: "globalServeDisabled=1",
        });
      const r1 = await freezePost(mkReq());
      const r2 = await freezePost(mkReq());
      const locations = [r1.headers.get("location") || "", r2.headers.get("location") || ""];
      expect(locations.some((l) => l.includes("error=RATE_LIMIT"))).toBeTruthy();
    } finally {
      if (prev == null) delete process.env.RATE_LIMIT_ADMIN_SECURITY_FREEZE_PER_MIN;
      else process.env.RATE_LIMIT_ADMIN_SECURITY_FREEZE_PER_MIN = prev;
    }
  });

  test("admin billing settings route redirects with RATE_LIMIT for constrained burst", async () => {
    const prev = process.env.RATE_LIMIT_ADMIN_BILLING_SETTINGS_PER_MIN;
    process.env.RATE_LIMIT_ADMIN_BILLING_SETTINGS_PER_MIN = "1";
    try {
      const ip = nextIp();
      const mkReq = () =>
        new NextRequest("http://localhost/api/admin/billing", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "content-length": "24",
            "x-forwarded-for": ip,
          },
          body: "enforcePlanLimits=on",
        });
      const r1 = await billingSettingsPost(mkReq());
      const r2 = await billingSettingsPost(mkReq());
      const locations = [r1.headers.get("location") || "", r2.headers.get("location") || ""];
      expect(locations.some((l) => l.includes("error=RATE_LIMIT"))).toBeTruthy();
    } finally {
      if (prev == null) delete process.env.RATE_LIMIT_ADMIN_BILLING_SETTINGS_PER_MIN;
      else process.env.RATE_LIMIT_ADMIN_BILLING_SETTINGS_PER_MIN = prev;
    }
  });

  test("upload abort route returns RATE_LIMIT for constrained burst", async () => {
    const prev = process.env.RATE_LIMIT_ADMIN_UPLOAD_ABORT_PER_MIN;
    process.env.RATE_LIMIT_ADMIN_UPLOAD_ABORT_PER_MIN = "1";
    try {
      const ip = nextIp();
      const mkReq = () =>
        new NextRequest("http://localhost/api/admin/upload/abort", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": "2",
            "x-forwarded-for": ip,
          },
          body: "{}",
        });
      const r1 = await uploadAbortPost(mkReq());
      const r2 = await uploadAbortPost(mkReq());
      const b1 = await r1.json().catch(() => ({}));
      const b2 = await r2.json().catch(() => ({}));
      const rateLimited = [b1?.error, b2?.error].includes("RATE_LIMIT");
      expect(rateLimited).toBeTruthy();
    } finally {
      if (prev == null) delete process.env.RATE_LIMIT_ADMIN_UPLOAD_ABORT_PER_MIN;
      else process.env.RATE_LIMIT_ADMIN_UPLOAD_ABORT_PER_MIN = prev;
    }
  });

  test("admin abuse route returns RATE_LIMIT for constrained burst", async () => {
    const prev = process.env.RATE_LIMIT_ADMIN_ABUSE_PER_MIN;
    process.env.RATE_LIMIT_ADMIN_ABUSE_PER_MIN = "1";
    try {
      const ip = nextIp();
      const mkReq = () =>
        new NextRequest("http://localhost/api/admin/abuse", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": "2",
            "x-forwarded-for": ip,
          },
          body: "{}",
        });
      const r1 = await adminAbusePost(mkReq());
      const r2 = await adminAbusePost(mkReq());
      const b1 = await r1.json().catch(() => ({}));
      const b2 = await r2.json().catch(() => ({}));
      expect([b1?.error, b2?.error].includes("RATE_LIMIT")).toBeTruthy();
    } finally {
      if (prev == null) delete process.env.RATE_LIMIT_ADMIN_ABUSE_PER_MIN;
      else process.env.RATE_LIMIT_ADMIN_ABUSE_PER_MIN = prev;
    }
  });

  test("admin dmca route returns RATE_LIMITED for constrained burst", async () => {
    const prev = process.env.RATE_LIMIT_API_IP_PER_MIN;
    process.env.RATE_LIMIT_API_IP_PER_MIN = "1";
    try {
      const ip = nextIp();
      const mkReq = () =>
        new NextRequest("http://localhost/api/admin/dmca", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": "2",
            "x-forwarded-for": ip,
          },
          body: "{}",
        });
      const r1 = await adminDmcaPost(mkReq());
      const r2 = await adminDmcaPost(mkReq());
      const b1 = await r1.json().catch(() => ({}));
      const b2 = await r2.json().catch(() => ({}));
      expect([b1?.error, b2?.error].includes("RATE_LIMITED")).toBeTruthy();
    } finally {
      if (prev == null) delete process.env.RATE_LIMIT_API_IP_PER_MIN;
      else process.env.RATE_LIMIT_API_IP_PER_MIN = prev;
    }
  });

  test("upload presign route returns RATE_LIMIT for constrained burst", async () => {
    const prev = process.env.RATE_LIMIT_API_IP_PER_MIN;
    process.env.RATE_LIMIT_API_IP_PER_MIN = "1";
    try {
      const ip = nextIp();
      const mkReq = () =>
        new NextRequest("http://localhost/api/admin/upload/presign", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": "2",
            "x-forwarded-for": ip,
          },
          body: "{}",
        });
      const r1 = await uploadPresignPost(mkReq());
      const r2 = await uploadPresignPost(mkReq());
      const b1 = await r1.json().catch(() => ({}));
      const b2 = await r2.json().catch(() => ({}));
      expect([b1?.error, b2?.error].includes("RATE_LIMIT")).toBeTruthy();
    } finally {
      if (prev == null) delete process.env.RATE_LIMIT_API_IP_PER_MIN;
      else process.env.RATE_LIMIT_API_IP_PER_MIN = prev;
    }
  });

  test("upload complete route returns RATE_LIMIT for constrained burst", async () => {
    const prev = process.env.RATE_LIMIT_API_IP_PER_MIN;
    process.env.RATE_LIMIT_API_IP_PER_MIN = "1";
    try {
      const ip = nextIp();
      const mkReq = () =>
        new NextRequest("http://localhost/api/admin/upload/complete", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": "2",
            "x-forwarded-for": ip,
          },
          body: "{}",
        });
      const r1 = await uploadCompletePost(mkReq());
      const r2 = await uploadCompletePost(mkReq());
      const b1 = await r1.json().catch(() => ({}));
      const b2 = await r2.json().catch(() => ({}));
      expect([b1?.error, b2?.error].includes("RATE_LIMIT")).toBeTruthy();
    } finally {
      if (prev == null) delete process.env.RATE_LIMIT_API_IP_PER_MIN;
      else process.env.RATE_LIMIT_API_IP_PER_MIN = prev;
    }
  });

  test("admin billing checkout route redirects with RATE_LIMIT for constrained burst", async () => {
    await expectRateLimitRedirectBurst({
      envKey: "RATE_LIMIT_ADMIN_BILLING_CHECKOUT_PER_MIN",
      handler: adminBillingCheckoutPost,
      url: "http://localhost/api/admin/billing/checkout",
    });
  });

  test("admin billing portal route redirects with RATE_LIMIT for constrained burst", async () => {
    await expectRateLimitRedirectBurst({
      envKey: "RATE_LIMIT_ADMIN_BILLING_PORTAL_PER_MIN",
      handler: adminBillingPortalPost,
      url: "http://localhost/api/admin/billing/portal",
    });
  });

  test("admin billing sync route redirects with RATE_LIMIT for constrained burst", async () => {
    await expectRateLimitRedirectBurst({
      envKey: "RATE_LIMIT_ADMIN_BILLING_SYNC_PER_MIN",
      handler: adminBillingSyncPost,
      url: "http://localhost/api/admin/billing/sync",
    });
  });

  test("admin billing view-override route redirects with RATE_LIMIT for constrained burst", async () => {
    await expectRateLimitRedirectBurst({
      envKey: "RATE_LIMIT_ADMIN_BILLING_OVERRIDE_PER_MIN",
      handler: adminBillingViewOverridePost,
      url: "http://localhost/api/admin/billing/view-override",
    });
  });

  test("viewer billing checkout route redirects with RATE_LIMIT for constrained burst", async () => {
    await expectRateLimitRedirectBurst({
      envKey: "RATE_LIMIT_BILLING_CHECKOUT_PER_MIN",
      handler: viewerBillingCheckoutPost,
      url: "http://localhost/api/billing/checkout",
    });
  });

  test("security migrate-legacy route returns RATE_LIMIT for constrained burst", async () => {
    await expectRateLimitJsonBurst({
      envKey: "RATE_LIMIT_ADMIN_SECURITY_MIGRATE_PER_MIN",
      handler: securityMigrateLegacyPost,
      url: "http://localhost/api/admin/security/migrate-legacy",
    });
  });

  test("security org-access route redirects with RATE_LIMIT for constrained burst", async () => {
    await expectRateLimitRedirectBurst({
      envKey: "RATE_LIMIT_ADMIN_SECURITY_ORG_ACCESS_PER_MIN",
      handler: securityOrgAccessPost,
      url: "http://localhost/api/admin/security/org-access",
    });
  });

  test("security rbac route returns RATE_LIMIT for constrained burst", async () => {
    await expectRateLimitJsonBurst({
      envKey: "RATE_LIMIT_ADMIN_SECURITY_RBAC_PER_MIN",
      handler: securityRbacPost,
      url: "http://localhost/api/admin/security/rbac",
    });
  });

  test("security requeue-scans route redirects with RATE_LIMIT for constrained burst", async () => {
    await expectRateLimitRedirectBurst({
      envKey: "RATE_LIMIT_ADMIN_SECURITY_REQUEUE_PER_MIN",
      handler: securityRequeueScansPost,
      url: "http://localhost/api/admin/security/requeue-scans",
    });
  });

  test("security revoke route returns RATE_LIMIT for constrained burst", async () => {
    await expectRateLimitJsonBurst({
      envKey: "RATE_LIMIT_ADMIN_SECURITY_KEY_OPS_PER_MIN",
      handler: securityRevokePost,
      url: "http://localhost/api/admin/security/revoke",
    });
  });

  test("security rotate route returns RATE_LIMIT for constrained burst", async () => {
    await expectRateLimitJsonBurst({
      envKey: "RATE_LIMIT_ADMIN_SECURITY_KEY_OPS_PER_MIN",
      handler: securityRotatePost,
      url: "http://localhost/api/admin/security/rotate",
    });
  });

  test("security rollback route returns RATE_LIMIT for constrained burst", async () => {
    await expectRateLimitJsonBurst({
      envKey: "RATE_LIMIT_ADMIN_SECURITY_KEY_OPS_PER_MIN",
      handler: securityRollbackPost,
      url: "http://localhost/api/admin/security/rollback",
    });
  });

  test("security tenant-freeze route returns RATE_LIMIT for constrained burst", async () => {
    await expectRateLimitJsonBurst({
      envKey: "RATE_LIMIT_ADMIN_SECURITY_TENANT_FREEZE_PER_MIN",
      handler: securityTenantFreezePost,
      url: "http://localhost/api/admin/security/tenant-freeze",
    });
  });
});
