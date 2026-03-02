import { expect, test } from "@playwright/test";
import { getCountryFromHeaders, isCountryAllowed } from "../src/lib/geo";
import { cookieHeader, deleteCookieHeader, getCookie } from "../src/lib/cookies";
import { getClientIp, hashIp } from "../src/lib/view";

test.describe("geo, cookie, and view helpers", () => {
  test("extracts and normalizes country from headers", () => {
    const h1 = new Headers({ "x-vercel-ip-country": "us" });
    expect(getCountryFromHeaders(h1)).toBe("US");

    const h2 = new Headers({ "cf-ipcountry": "XX" });
    expect(getCountryFromHeaders(h2)).toBeNull();

    const h3 = new Headers({ "cf-ipcountry": "U1" });
    expect(getCountryFromHeaders(h3)).toBeNull();

    const h4 = new Headers({ "x-vercel-ip-country": "ca", "cf-ipcountry": "us" });
    expect(getCountryFromHeaders(h4)).toBe("CA");
  });

  test("evaluates country allow/block lists", () => {
    expect(isCountryAllowed({ country: null, allowedCountries: ["US"], blockedCountries: [] })).toBeTruthy();
    expect(isCountryAllowed({ country: "US", allowedCountries: ["US", "CA"], blockedCountries: [] })).toBeTruthy();
    expect(isCountryAllowed({ country: "US", allowedCountries: ["CA"], blockedCountries: [] })).toBeFalsy();
    expect(isCountryAllowed({ country: "US", blockedCountries: ["US"] })).toBeFalsy();
    expect(
      isCountryAllowed({ country: "US", allowedCountries: ["US", "INVALID", "ZZZ"], blockedCountries: ["bad"] })
    ).toBeTruthy();
  });

  test("builds and parses cookie headers", () => {
    const header = cookieHeader("session", "abc123", { sameSite: "Strict", maxAgeSeconds: 60 });
    expect(header).toContain("session=abc123");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Strict");
    expect(header).toContain("Max-Age=60");

    const del = deleteCookieHeader("session");
    expect(del).toContain("session=");
    expect(del).toContain("Max-Age=0");

    const req = new Request("http://localhost", {
      headers: { cookie: "a=1; session=abc123; b=2" },
    });
    expect(getCookie(req, "session")).toBe("abc123");
    expect(getCookie(req, "missing")).toBeNull();
  });

  test("extracts client IP and hashes it", () => {
    process.env.VIEW_SALT = "view-test-salt";
    const req1 = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(req1)).toBe("1.2.3.4");

    const req2 = new Request("http://localhost", {
      headers: { "x-real-ip": "9.8.7.6" },
    });
    expect(getClientIp(req2)).toBe("9.8.7.6");

    const h1 = hashIp("1.2.3.4");
    const h2 = hashIp("1.2.3.4");
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  test("view hashIp returns null for empty values", () => {
    expect(hashIp("")).toBeNull();
    expect(hashIp(null)).toBeNull();
    expect(hashIp(undefined)).toBeNull();
  });

  test("view hashIp output changes with VIEW_SALT", () => {
    process.env.VIEW_SALT = "salt-a";
    const a = hashIp("8.8.8.8");
    process.env.VIEW_SALT = "salt-b";
    const b = hashIp("8.8.8.8");
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toBe(b);
  });
});
