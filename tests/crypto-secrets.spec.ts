import { expect, test } from "@playwright/test";
import { decryptSecret, encryptSecret } from "../src/lib/cryptoSecrets";

const KEY_NAME = "OIDC_SECRETS_KEY";

function makeKeyBase64(fillByte: number): string {
  return Buffer.alloc(32, fillByte).toString("base64");
}

test.describe("crypto secret helpers", () => {
  const previous = process.env[KEY_NAME];

  test.afterEach(() => {
    if (typeof previous === "undefined") delete process.env[KEY_NAME];
    else process.env[KEY_NAME] = previous;
  });

  test("round-trips encrypted secrets", () => {
    process.env[KEY_NAME] = makeKeyBase64(7);
    const ciphertext = encryptSecret("super-secret-value");
    expect(ciphertext.startsWith("v1:")).toBeTruthy();
    expect(decryptSecret(ciphertext)).toBe("super-secret-value");
  });

  test("produces different ciphertexts for same plaintext due to random IV", () => {
    process.env[KEY_NAME] = makeKeyBase64(9);
    const a = encryptSecret("same-input");
    const b = encryptSecret("same-input");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same-input");
    expect(decryptSecret(b)).toBe("same-input");
  });

  test("fails closed for missing key", () => {
    delete process.env[KEY_NAME];
    expect(() => encryptSecret("x")).toThrow(/Missing OIDC_SECRETS_KEY/);
    expect(() => decryptSecret("v1:iv:tag:ct")).toThrow(/Missing OIDC_SECRETS_KEY/);
  });

  test("fails closed for invalid key length", () => {
    process.env[KEY_NAME] = Buffer.alloc(16, 1).toString("base64");
    expect(() => encryptSecret("x")).toThrow(/exactly 32 bytes/);
  });

  test("rejects invalid and tampered ciphertext", () => {
    process.env[KEY_NAME] = makeKeyBase64(11);

    expect(() => decryptSecret("not-a-v1-token")).toThrow(/Invalid encrypted secret format/);

    const ciphertext = encryptSecret("sensitive");
    const parts = ciphertext.split(":");
    expect(parts).toHaveLength(4);

    const ct = Buffer.from(parts[3], "base64");
    ct[0] ^= 0xff;
    const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${ct.toString("base64")}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
