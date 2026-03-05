import { expect, test } from "@playwright/test";
import { normalizeOrgSlug } from "../src/lib/tenant";

test.describe("tenant org slug normalization", () => {
  test("accepts valid slugs and normalizes case/whitespace", () => {
    expect(normalizeOrgSlug("  Acme-123  ")).toBe("acme-123");
    expect(normalizeOrgSlug("a")).toBe("a");
    expect(normalizeOrgSlug("a-b-c")).toBe("a-b-c");
  });

  test("rejects invalid slug formats", () => {
    expect(normalizeOrgSlug("")).toBeNull();
    expect(normalizeOrgSlug(" ")).toBeNull();
    expect(normalizeOrgSlug("-starts-with-dash")).toBeNull();
    expect(normalizeOrgSlug("ends-with-dash-")).toBeNull();
    expect(normalizeOrgSlug("with_underscore")).toBeNull();
    expect(normalizeOrgSlug("with/slash")).toBeNull();
    expect(normalizeOrgSlug("with..dots")).toBeNull();
    expect(normalizeOrgSlug("acme\r\ncorp")).toBeNull();
  });

  test("rejects overlong slugs", () => {
    expect(normalizeOrgSlug(`a${"b".repeat(63)}`)).toBeNull();
    expect(normalizeOrgSlug(`a${"b".repeat(62)}`)).toHaveLength(63);
  });
});
