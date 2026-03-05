import { expect, test } from "@playwright/test";
import { sendAccountActivationEmail, sendMail, sendShareEmail } from "../src/lib/email";

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

test.describe("email helper guardrails", () => {
  test("rejects malformed recipient and subject inputs before delivery", async () => {
    await expect(sendMail({ to: "bad\r\n@example.com", subject: "Subject", text: "Body" })).rejects.toThrow(
      /INVALID_EMAIL_TO/
    );
    await expect(sendMail({ to: "user@example.com", subject: "Bad\r\nSubject", text: "Body" })).rejects.toThrow(
      /INVALID_EMAIL_SUBJECT/
    );
  });

  test("rejects malformed activation and share URLs", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "DocLinks <login@cyang.io>";

    await expect(
      sendAccountActivationEmail({ to: "user@example.com", activationUrl: "javascript:alert(1)" })
    ).rejects.toThrow(/INVALID_ACTIVATIONURL/);

    await expect(
      sendShareEmail({
        to: "user@example.com",
        subject: "Doc shared",
        brandName: "DocLinks",
        brandColor: "#123456",
        docTitle: "Quarterly Report",
        shareUrl: "not-a-url",
      })
    ).rejects.toThrow(/INVALID_SHAREURL/);
  });
});
