import { expect, test } from "@playwright/test";
import { validatePasswordComplexity } from "../src/lib/signup";

test.describe("signup password complexity", () => {
  test("rejects too-short passwords", () => {
    expect(validatePasswordComplexity("Ab1!short")).toBe("Password must be at least 12 characters.");
  });

  test("rejects when required character classes are missing", () => {
    expect(validatePasswordComplexity("ABCDEFGHIJK1!")).toBe("Password must include a lowercase letter.");
    expect(validatePasswordComplexity("abcdefghijk1!")).toBe("Password must include an uppercase letter.");
    expect(validatePasswordComplexity("Abcdefghijk!")).toBe("Password must include a number.");
    expect(validatePasswordComplexity("Abcdefghijk1")).toBe("Password must include a symbol.");
  });

  test("accepts strong password", () => {
    expect(validatePasswordComplexity("StrongPass123!")).toBeNull();
  });
});
