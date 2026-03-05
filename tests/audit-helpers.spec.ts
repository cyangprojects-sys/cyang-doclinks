import { expect, test } from "@playwright/test";
import {
  deviceHashFrom,
  getClientIpFromHeaders,
  getUserAgentFromHeaders,
  isDeviceTrustedForDoc,
  logDocAccess,
  trustDeviceForDoc,
} from "../src/lib/audit";

test.describe("audit helper primitives", () => {
  const snapDeviceSalt = process.env.DEVICE_TRUST_SALT;
  const snapViewSalt = process.env.VIEW_SALT;

  test.afterEach(() => {
    if (typeof snapDeviceSalt === "undefined") delete process.env.DEVICE_TRUST_SALT;
    else process.env.DEVICE_TRUST_SALT = snapDeviceSalt;
    if (typeof snapViewSalt === "undefined") delete process.env.VIEW_SALT;
    else process.env.VIEW_SALT = snapViewSalt;
  });

  test("extracts client IP with expected header precedence", () => {
    const h1 = new Headers({
      "cf-connecting-ip": "9.9.9.9",
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
      "x-real-ip": "7.7.7.7",
    });
    expect(getClientIpFromHeaders(h1)).toBe("9.9.9.9");

    const h2 = new Headers({
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
      "x-real-ip": "7.7.7.7",
    });
    expect(getClientIpFromHeaders(h2)).toBe("1.2.3.4");

    const h3 = new Headers({
      "x-real-ip": "7.7.7.7",
      "x-vercel-forwarded-for": "8.8.8.8, 4.4.4.4",
    });
    expect(getClientIpFromHeaders(h3)).toBe("8.8.8.8");

    const h4 = new Headers({ "x-vercel-forwarded-for": "8.8.8.8, 4.4.4.4" });
    expect(getClientIpFromHeaders(h4)).toBe("8.8.8.8");
  });

  test("extracts user agent and trims whitespace", () => {
    const h = new Headers({ "user-agent": "  Mozilla/5.0 test " });
    expect(getUserAgentFromHeaders(h)).toBe("Mozilla/5.0 test");
    expect(getUserAgentFromHeaders(new Headers())).toBe("");
  });

  test("caps oversized user-agent header values", () => {
    const longUa = `ua-${"x".repeat(800)}`;
    const out = getUserAgentFromHeaders(new Headers({ "user-agent": longUa }));
    expect(out.length).toBe(512);
  });

  test("deviceHashFrom is deterministic and requires configured salt", () => {
    delete process.env.DEVICE_TRUST_SALT;
    delete process.env.VIEW_SALT;
    expect(deviceHashFrom("1.2.3.4", "ua")).toBeNull();

    process.env.VIEW_SALT = "view-salt";
    const a = deviceHashFrom("1.2.3.4", "ua");
    const b = deviceHashFrom("1.2.3.4", "ua");
    expect(a).toBe(b);
    expect(a).toHaveLength(40);

    process.env.DEVICE_TRUST_SALT = "device-salt";
    const c = deviceHashFrom("1.2.3.4", "ua");
    expect(c).not.toBe(a);
  });

  test("deviceHashFrom returns null when both ip and user-agent are empty", () => {
    process.env.DEVICE_TRUST_SALT = "device-salt";
    expect(deviceHashFrom("", "")).toBeNull();
    expect(deviceHashFrom("   ", "   ")).toBeNull();
  });

  test("device trust and audit writers fail closed on malformed identifiers", async () => {
    await expect(
      isDeviceTrustedForDoc({ docId: "not-a-uuid", deviceHash: "abcd" })
    ).resolves.toBeFalsy();
    await expect(
      trustDeviceForDoc({
        docId: "not-a-uuid",
        deviceHash: "abcd",
        trustedUntilIso: "not-a-date",
      })
    ).resolves.toBeUndefined();
    await expect(
      logDocAccess({
        docId: "not-a-uuid",
        alias: "a",
        shareId: "s",
        token: "t",
        emailUsed: "u@example.com",
        ip: "1.2.3.4",
        userAgent: "ua",
      })
    ).resolves.toBeUndefined();
  });
});
