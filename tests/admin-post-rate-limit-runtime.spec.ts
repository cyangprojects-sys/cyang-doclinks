import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";
import { POST as activatePost } from "../src/app/api/admin/security/activate/route";
import { POST as freezePost } from "../src/app/api/admin/security/freeze/route";
import { POST as billingSettingsPost } from "../src/app/api/admin/billing/route";
import { POST as uploadAbortPost } from "../src/app/api/admin/upload/abort/route";

let ipSeed = 120;
function nextIp(): string {
  ipSeed = (ipSeed + 1) % 250;
  return `203.0.113.${ipSeed}`;
}

test.describe("admin post route runtime rate-limit behavior", () => {
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
});
