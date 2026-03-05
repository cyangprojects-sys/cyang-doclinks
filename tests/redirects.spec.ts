import { expect, test } from "@playwright/test";
import { sanitizeInternalRedirectPath } from "../src/lib/redirects";

test.describe("internal redirect sanitizer", () => {
  test("allows safe internal paths", () => {
    expect(sanitizeInternalRedirectPath("/admin/dashboard")).toBe("/admin/dashboard");
    expect(sanitizeInternalRedirectPath("/mfa?next=%2Fadmin%2Fdashboard")).toBe(
      "/mfa?next=%2Fadmin%2Fdashboard"
    );
  });

  test("rejects external, protocol-relative, and malformed values", () => {
    const fallback = "/admin/dashboard";
    expect(sanitizeInternalRedirectPath("https://evil.example", fallback)).toBe(fallback);
    expect(sanitizeInternalRedirectPath("//evil.example", fallback)).toBe(fallback);
    expect(sanitizeInternalRedirectPath("/\\evil", fallback)).toBe(fallback);
    expect(sanitizeInternalRedirectPath("/admin\nx", fallback)).toBe(fallback);
    expect(sanitizeInternalRedirectPath("/%zz", fallback)).toBe(fallback);
    expect(sanitizeInternalRedirectPath("/../admin", fallback)).toBe(fallback);
    expect(sanitizeInternalRedirectPath("/a/../b", fallback)).toBe(fallback);
  });
});
