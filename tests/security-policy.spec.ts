import { expect, test } from "@playwright/test";
import { allowUnencryptedServing, isSecurityTestNoDbMode } from "../src/lib/securityPolicy";

test.describe("security policy primitives", () => {
  const snap = {
    SECURITY_TEST_NO_DB: process.env.SECURITY_TEST_NO_DB,
  };

  test.afterEach(() => {
    process.env.SECURITY_TEST_NO_DB = snap.SECURITY_TEST_NO_DB;
  });

  test("unencrypted serving is always disabled by invariant", () => {
    expect(allowUnencryptedServing()).toBeFalsy();
  });

  test("security test no-db mode parses truthy values", () => {
    process.env.SECURITY_TEST_NO_DB = "1";
    expect(isSecurityTestNoDbMode()).toBeTruthy();
    process.env.SECURITY_TEST_NO_DB = "true";
    expect(isSecurityTestNoDbMode()).toBeTruthy();
  });

  test("security test no-db mode parses falsy/empty values", () => {
    delete process.env.SECURITY_TEST_NO_DB;
    expect(isSecurityTestNoDbMode()).toBeFalsy();
    process.env.SECURITY_TEST_NO_DB = "0";
    expect(isSecurityTestNoDbMode()).toBeFalsy();
    process.env.SECURITY_TEST_NO_DB = "off";
    expect(isSecurityTestNoDbMode()).toBeFalsy();
  });
});
