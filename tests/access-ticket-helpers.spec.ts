import { expect, test } from "@playwright/test";
import {
  hashIpForTicket,
  hashUserAgent,
  signedUrlTtlSeconds,
  ticketTtlSeconds,
} from "../src/lib/accessTicket";

test.describe("access ticket helpers", () => {
  const snap = {
    VIEW_SALT: process.env.VIEW_SALT,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    DEV_ALLOW_INSECURE_FALLBACK: process.env.DEV_ALLOW_INSECURE_FALLBACK,
    NODE_ENV: process.env.NODE_ENV,
    ACCESS_TICKET_TTL_SECONDS: process.env.ACCESS_TICKET_TTL_SECONDS,
    ACCESS_TICKET_SIGNED_URL_TTL_SECONDS: process.env.ACCESS_TICKET_SIGNED_URL_TTL_SECONDS,
  };

  test.afterEach(() => {
    process.env.VIEW_SALT = snap.VIEW_SALT;
    process.env.NEXTAUTH_SECRET = snap.NEXTAUTH_SECRET;
    process.env.DEV_ALLOW_INSECURE_FALLBACK = snap.DEV_ALLOW_INSECURE_FALLBACK;
    process.env.NODE_ENV = snap.NODE_ENV;
    process.env.ACCESS_TICKET_TTL_SECONDS = snap.ACCESS_TICKET_TTL_SECONDS;
    process.env.ACCESS_TICKET_SIGNED_URL_TTL_SECONDS = snap.ACCESS_TICKET_SIGNED_URL_TTL_SECONDS;
  });

  test("returns null for empty ip/ua inputs", () => {
    process.env.VIEW_SALT = "ticket-salt";
    expect(hashIpForTicket("")).toBeNull();
    expect(hashUserAgent("")).toBeNull();
  });

  test("hashes ip and user-agent deterministically when secret exists", () => {
    process.env.VIEW_SALT = "ticket-salt";
    const ipA = hashIpForTicket("1.2.3.4");
    const ipB = hashIpForTicket("1.2.3.4");
    const uaA = hashUserAgent("Mozilla/5.0");
    const uaB = hashUserAgent("Mozilla/5.0");
    expect(ipA).toBe(ipB);
    expect(uaA).toBe(uaB);
    expect(ipA).toHaveLength(32);
    expect(uaA).toHaveLength(32);
  });

  test("throws without binding secret when fallback is disabled", () => {
    delete process.env.VIEW_SALT;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.DEV_ALLOW_INSECURE_FALLBACK;
    process.env.NODE_ENV = "development";
    expect(() => hashIpForTicket("1.2.3.4")).toThrow("Missing VIEW_SALT or NEXTAUTH_SECRET");
  });

  test("uses dev fallback when explicitly enabled", () => {
    delete process.env.VIEW_SALT;
    delete process.env.NEXTAUTH_SECRET;
    process.env.NODE_ENV = "development";
    process.env.DEV_ALLOW_INSECURE_FALLBACK = "1";
    const out = hashUserAgent("Mozilla/5.0");
    expect(out).toHaveLength(32);
  });

  test("uses NEXTAUTH_SECRET when VIEW_SALT is missing", () => {
    delete process.env.VIEW_SALT;
    process.env.NEXTAUTH_SECRET = "nextauth-secret";
    const a = hashIpForTicket("1.2.3.4");
    const b = hashIpForTicket("1.2.3.4");
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
  });

  test("does not allow dev fallback in production", () => {
    delete process.env.VIEW_SALT;
    delete process.env.NEXTAUTH_SECRET;
    process.env.NODE_ENV = "production";
    process.env.DEV_ALLOW_INSECURE_FALLBACK = "1";
    expect(() => hashUserAgent("Mozilla/5.0")).toThrow("Missing VIEW_SALT or NEXTAUTH_SECRET");
  });

  test("reads ticket ttl values from env", () => {
    process.env.ACCESS_TICKET_TTL_SECONDS = "45";
    process.env.ACCESS_TICKET_SIGNED_URL_TTL_SECONDS = "20";
    expect(ticketTtlSeconds()).toBe(45);
    expect(signedUrlTtlSeconds()).toBe(20);
  });

  test("falls back to safe default ttl for malformed env values", () => {
    process.env.ACCESS_TICKET_TTL_SECONDS = "not-a-number";
    process.env.ACCESS_TICKET_SIGNED_URL_TTL_SECONDS = "bad";
    expect(ticketTtlSeconds()).toBe(30);
    expect(signedUrlTtlSeconds()).toBe(30);
  });

  test("clamps ttl values to minimum of 1 second", () => {
    process.env.ACCESS_TICKET_TTL_SECONDS = "0";
    process.env.ACCESS_TICKET_SIGNED_URL_TTL_SECONDS = "-10";
    expect(ticketTtlSeconds()).toBe(1);
    expect(signedUrlTtlSeconds()).toBe(1);
  });
});
