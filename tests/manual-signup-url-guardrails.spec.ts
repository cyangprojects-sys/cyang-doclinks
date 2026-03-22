import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("manual signup URL guardrails", () => {
  test("manual signup activation link uses trusted base-url resolver", () => {
    const code = readFileSync("src/app/api/auth/manual-signup/route.ts", "utf8");
    expect(code.includes("resolvePublicAppBaseUrl(req.url)")).toBeTruthy();
    expect(code.includes("new URL(req.url).origin")).toBeFalsy();
  });

  test("manual signup and consent routes enforce strict terms parsing and payload limits", () => {
    const signupCode = readFileSync("src/app/api/auth/manual-signup/route.ts", "utf8");
    const consentCode = readFileSync("src/app/api/auth/signup-consent/route.ts", "utf8");

    expect(signupCode.includes("MAX_SIGNUP_BODY_BYTES")).toBeTruthy();
    expect(signupCode.includes("isTermsAccepted(")).toBeTruthy();
    expect(signupCode.includes("signup_activation.sql")).toBeFalsy();
    expect(signupCode.includes('error: "SIGNUP_NOT_CONFIGURED"')).toBeTruthy();
    expect(consentCode.includes("MAX_CONSENT_BODY_BYTES")).toBeTruthy();
    expect(consentCode.includes("isTermsAccepted(")).toBeTruthy();
  });
});
