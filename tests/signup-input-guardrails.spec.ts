import { expect, test } from "@playwright/test";
import { createOrRefreshManualSignup, isTermsAccepted } from "../src/lib/signup";

test.describe("signup input guardrails", () => {
  test("accept-terms parsing is strict and fails closed on unsafe values", () => {
    expect(isTermsAccepted(true)).toBeTruthy();
    expect(isTermsAccepted("true")).toBeTruthy();
    expect(isTermsAccepted("1")).toBeTruthy();

    expect(isTermsAccepted(false)).toBeFalsy();
    expect(isTermsAccepted("false")).toBeFalsy();
    expect(isTermsAccepted("yes\n")).toBeFalsy();
    expect(isTermsAccepted("")).toBeFalsy();
  });

  test("manual signup helper rejects invalid input before DB operations", async () => {
    await expect(
      createOrRefreshManualSignup({
        firstName: "A",
        lastName: "B",
        email: "not-an-email",
        password: "StrongPassword123!",
        company: "C",
        jobTitle: "",
        country: "US",
      })
    ).rejects.toThrow(/INVALID_SIGNUP_INPUT/);

    await expect(
      createOrRefreshManualSignup({
        firstName: "A".repeat(130),
        lastName: "B",
        email: "user@example.com",
        password: "StrongPassword123!",
        company: "Acme",
        jobTitle: "",
        country: "US",
      })
    ).rejects.toThrow(/INVALID_SIGNUP_INPUT/);
  });
});
