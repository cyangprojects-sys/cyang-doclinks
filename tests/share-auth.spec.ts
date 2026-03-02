import { expect, test } from "@playwright/test";
import {
  deviceTrustCookieName,
  makeDeviceTrustCookieValue,
  makeEmailProofToken,
  makeUnlockCookieValue,
  shareUnlockCookieName,
  unlockCookieOptions,
  verifyDeviceTrustCookieValue,
  verifyEmailProofToken,
  verifyUnlockCookieValue,
} from "../src/lib/shareAuth";

test.describe("share auth helpers", () => {
  const snap = {
    SHARE_COOKIE_SECRET: process.env.SHARE_COOKIE_SECRET,
    VIEW_SALT: process.env.VIEW_SALT,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  };

  test.beforeEach(() => {
    process.env.SHARE_COOKIE_SECRET = "test-share-cookie-secret";
  });

  test.afterEach(() => {
    process.env.SHARE_COOKIE_SECRET = snap.SHARE_COOKIE_SECRET;
    process.env.VIEW_SALT = snap.VIEW_SALT;
    process.env.NEXTAUTH_SECRET = snap.NEXTAUTH_SECRET;
  });

  test("exposes expected cookie names and options", () => {
    expect(shareUnlockCookieName()).toBe("cyang_share_unlock");
    expect(deviceTrustCookieName()).toBe("cyang_trusted_device");
    const opts = unlockCookieOptions();
    expect(opts.httpOnly).toBeTruthy();
    expect(opts.sameSite).toBe("lax");
    expect(opts.secure).toBeTruthy();
  });

  test("round-trips unlock cookie value", () => {
    const token = "tok_demo";
    const value = makeUnlockCookieValue(token);
    const out = verifyUnlockCookieValue(value);
    expect(out.ok).toBeTruthy();
    if (out.ok) expect(out.token).toBe(token);
  });

  test("rejects expired unlock cookie value", () => {
    const oldNow = Date.now() - 9 * 60 * 60 * 1000;
    const value = makeUnlockCookieValue("tok_old", oldNow);
    const out = verifyUnlockCookieValue(value);
    expect(out.ok).toBeFalsy();
    if (!out.ok) expect(out.reason).toBe("expired");
  });

  test("rejects tampered unlock cookie signature", () => {
    const value = `${makeUnlockCookieValue("tok_x")}x`;
    const out = verifyUnlockCookieValue(value);
    expect(out.ok).toBeFalsy();
    if (!out.ok) expect(out.reason).toBe("sig");
  });

  test("round-trips device trust cookie value", () => {
    const value = makeDeviceTrustCookieValue("share_1", "device_hash_1");
    const out = verifyDeviceTrustCookieValue(value);
    expect(out.ok).toBeTruthy();
    if (out.ok) {
      expect(out.shareId).toBe("share_1");
      expect(out.deviceHash).toBe("device_hash_1");
    }
  });

  test("rejects malformed device trust cookie", () => {
    const out = verifyDeviceTrustCookieValue("bad.value");
    expect(out.ok).toBeFalsy();
    if (!out.ok) expect(out.reason).toBe("format");
  });

  test("round-trips email proof token with normalized email", () => {
    const tok = makeEmailProofToken({
      shareId: "share_abc",
      token: "tok_abc",
      email: "USER@Example.com",
      ttlSec: 600,
    });
    const out = verifyEmailProofToken(tok);
    expect(out.ok).toBeTruthy();
    if (out.ok) expect(out.email).toBe("user@example.com");
  });

  test("rejects expired email proof token", () => {
    const tok = makeEmailProofToken({
      shareId: "share_exp",
      token: "tok_exp",
      email: "u@example.com",
      nowMs: Date.now() - 20 * 60 * 1000,
      ttlSec: 600,
    });
    const out = verifyEmailProofToken(tok);
    expect(out.ok).toBeFalsy();
    if (!out.ok) expect(out.reason).toBe("expired");
  });
});
