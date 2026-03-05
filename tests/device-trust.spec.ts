import { expect, test } from "@playwright/test";
import {
  aliasTrustCookieName,
  DEVICE_TRUST_HOURS,
  isAliasTrusted,
  makeAliasTrustCookieValue,
} from "../src/lib/deviceTrust";

test.describe("device trust cookie helpers", () => {
  test.beforeAll(() => {
    process.env.APP_SECRET = process.env.APP_SECRET || "test-app-secret-device-trust";
  });

  test("normalizes alias for cookie naming", () => {
    const a = aliasTrustCookieName("Sales/Quarterly-Report");
    const b = aliasTrustCookieName("sales/quarterly-report");
    expect(a).toBe(b);
    expect(a.startsWith("alias_trust_")).toBeTruthy();
  });

  test("accepts a freshly signed trust cookie for the same alias", () => {
    const alias = "client-doc";
    const exp = Date.now() + DEVICE_TRUST_HOURS * 60 * 60 * 1000;
    const signed = makeAliasTrustCookieValue(alias, exp);
    expect(isAliasTrusted(alias, signed)).toBeTruthy();
  });

  test("rejects trust cookie for a different alias", () => {
    const exp = Date.now() + 60_000;
    const signed = makeAliasTrustCookieValue("alias-a", exp);
    expect(isAliasTrusted("alias-b", signed)).toBeFalsy();
  });

  test("rejects expired trust cookie", () => {
    expect(() => makeAliasTrustCookieValue("expired-alias", Date.now() - 1_000)).toThrow(/INVALID_EXPIRY/);
  });

  test("rejects invalid alias and malformed expiry when creating cookie value", () => {
    expect(() => makeAliasTrustCookieValue("", Date.now() + 1_000)).toThrow(/INVALID_ALIAS/);
    expect(() => makeAliasTrustCookieValue("alias-safe", Number.NaN)).toThrow(/INVALID_EXPIRY/);
    expect(() => makeAliasTrustCookieValue("alias-safe", Date.now() + DEVICE_TRUST_HOURS * 60 * 60 * 1000 * 3)).toThrow(
      /INVALID_EXPIRY/
    );
  });

  test("rejects tampered trust cookie", () => {
    const exp = Date.now() + 60_000;
    const signed = makeAliasTrustCookieValue("alias-safe", exp);
    const tampered = `${signed}x`;
    expect(isAliasTrusted("alias-safe", tampered)).toBeFalsy();
  });
});
