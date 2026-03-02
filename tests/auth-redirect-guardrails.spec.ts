import { expect, test } from "@playwright/test";
import { authOptions } from "../src/auth";

type RedirectCallback = (args: { url: string; baseUrl: string }) => Promise<string> | string;

function getRedirectCallback(): RedirectCallback {
  const cb = authOptions.callbacks?.redirect as RedirectCallback | undefined;
  if (!cb) throw new Error("authOptions.callbacks.redirect is not configured");
  return cb;
}

test.describe("auth redirect guardrails", () => {
  const baseUrl = "https://www.cyang.io";

  test("forces dashboard for external callback URLs", async () => {
    const redirect = getRedirectCallback();
    const out = await redirect({ url: "https://evil.example/phish", baseUrl });
    expect(out).toBe(`${baseUrl}/admin/dashboard`);
  });

  test("allows safe internal routes only", async () => {
    const redirect = getRedirectCallback();

    const admin = await redirect({ url: "/admin/security?saved=1", baseUrl });
    expect(admin).toBe(`${baseUrl}/admin/security?saved=1`);

    const home = await redirect({ url: "/", baseUrl });
    expect(home).toBe(baseUrl);

    const authRoute = await redirect({ url: "/api/auth/signout?callbackUrl=%2F", baseUrl });
    expect(authRoute).toBe(`${baseUrl}/api/auth/signout?callbackUrl=%2F`);
  });
});
