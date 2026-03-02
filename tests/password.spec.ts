import { expect, test } from "@playwright/test";
import { hashPassword, verifyPassword } from "../src/lib/password";

test.describe("password helpers", () => {
  test("hashes password with scrypt format and verifies correct secret", () => {
    const password = "CorrectHorseBatteryStaple!2026";
    const hash = hashPassword(password);
    expect(hash.startsWith("scrypt$")).toBeTruthy();
    expect(verifyPassword(password, hash)).toBeTruthy();
  });

  test("rejects wrong password for a valid hash", () => {
    const hash = hashPassword("secret-1");
    expect(verifyPassword("secret-2", hash)).toBeFalsy();
  });

  test("produces unique hashes for same password due to per-hash salt", () => {
    const a = hashPassword("same-password");
    const b = hashPassword("same-password");
    expect(a).not.toBe(b);
    expect(verifyPassword("same-password", a)).toBeTruthy();
    expect(verifyPassword("same-password", b)).toBeTruthy();
  });

  test("fails closed on malformed stored hash", () => {
    expect(verifyPassword("x", "")).toBeFalsy();
    expect(verifyPassword("x", "sha256$abc$def")).toBeFalsy();
    expect(verifyPassword("x", "scrypt$missing")).toBeFalsy();
    expect(verifyPassword("x", "scrypt$bad###$stillbad###")).toBeFalsy();
  });
});
