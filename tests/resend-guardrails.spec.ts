import { expect, test } from "@playwright/test";
import { sendSignInEmail } from "../src/lib/resend";

const SNAP = {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
};

test.afterEach(() => {
  if (typeof SNAP.RESEND_API_KEY === "string") process.env.RESEND_API_KEY = SNAP.RESEND_API_KEY;
  else delete process.env.RESEND_API_KEY;
  if (typeof SNAP.EMAIL_FROM === "string") process.env.EMAIL_FROM = SNAP.EMAIL_FROM;
  else delete process.env.EMAIL_FROM;
});

test.describe("resend sign-in guardrails", () => {
  test("rejects malformed recipient and sign-in URL inputs", async () => {
    await expect(sendSignInEmail("bad\r\n@example.com", "https://example.com/s/abc")).rejects.toThrow(
      /INVALID_EMAIL_TO/
    );
    await expect(sendSignInEmail("user@example.com", "javascript:alert(1)")).rejects.toThrow(/INVALID_SIGNIN_URL/);
  });
});
