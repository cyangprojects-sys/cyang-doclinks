import { expect, test } from "@playwright/test";
import type { NextRequest } from "next/server";
import { isCronAuthorized } from "../src/lib/cronAuth";

function toNextRequest(headers: HeadersInit): NextRequest {
  return { headers: new Headers(headers) } as unknown as NextRequest;
}

test.describe("cron auth", () => {
  const previous = process.env.CRON_SECRET;

  test.afterEach(() => {
    if (typeof previous === "undefined") delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  });

  test("fails closed when CRON_SECRET is missing", () => {
    delete process.env.CRON_SECRET;
    const req = toNextRequest({ authorization: "Bearer test" });
    expect(isCronAuthorized(req)).toBeFalsy();
  });

  test("accepts exact secret and bearer secret", () => {
    process.env.CRON_SECRET = "cron-secret";

    const rawReq = toNextRequest({ authorization: "cron-secret" });
    expect(isCronAuthorized(rawReq)).toBeTruthy();

    const bearerReq = toNextRequest({ authorization: "Bearer cron-secret" });
    expect(isCronAuthorized(bearerReq)).toBeTruthy();
  });

  test("accepts bearer case-insensitively and trims token", () => {
    process.env.CRON_SECRET = "cron-secret";
    const req = toNextRequest({ authorization: "bEaReR   cron-secret   " });
    expect(isCronAuthorized(req)).toBeTruthy();
  });

  test("rejects wrong or missing authorization values", () => {
    process.env.CRON_SECRET = "cron-secret";

    const wrong = toNextRequest({ authorization: "Bearer wrong" });
    expect(isCronAuthorized(wrong)).toBeFalsy();

    const missing = toNextRequest({});
    expect(isCronAuthorized(missing)).toBeFalsy();
  });
});
