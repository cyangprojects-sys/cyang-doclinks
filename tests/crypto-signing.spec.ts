import { expect, test } from "@playwright/test";
import { hmacSha256Hex, randomToken, signPayload, verifySignedPayload } from "../src/lib/crypto";

test.describe("crypto signing helpers", () => {
  test.beforeAll(() => {
    process.env.APP_SECRET = process.env.APP_SECRET || "test-app-secret-crypto-signing";
  });

  test("signs and verifies payload round-trip", () => {
    const payload = { role: "viewer", iat: Date.now() };
    const signed = signPayload(payload);
    const verified = verifySignedPayload<typeof payload>(signed);
    expect(verified).not.toBeNull();
    expect(verified?.role).toBe("viewer");
  });

  test("rejects tampered signed payload", () => {
    const signed = signPayload({ x: 1 });
    const tampered = `${signed}x`;
    const verified = verifySignedPayload<{ x: number }>(tampered);
    expect(verified).toBeNull();
  });

  test("rejects malformed signed payload format", () => {
    const verified = verifySignedPayload<{ x: number }>("not-a-signed-token");
    expect(verified).toBeNull();
  });

  test("hmac helper is deterministic for same input", () => {
    const a = hmacSha256Hex("security-check");
    const b = hmacSha256Hex("security-check");
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  test("randomToken returns non-empty base64url-like values", () => {
    const token = randomToken(24);
    expect(token.length).toBeGreaterThan(0);
    expect(/^[A-Za-z0-9_-]+$/.test(token)).toBeTruthy();
  });
});
