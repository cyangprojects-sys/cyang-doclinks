import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { normalizeWebhookUrl } from "../src/lib/webhooks";

function toProcessEnv(vars: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return vars as unknown as NodeJS.ProcessEnv;
}

test.describe("webhook url guardrails", () => {
  test("accepts public https webhook URLs", () => {
    const out = normalizeWebhookUrl("https://example.com/webhook");
    expect(out).toBe("https://example.com/webhook");
  });

  test("blocks insecure and private webhook URLs by default", () => {
    expect(() => normalizeWebhookUrl("http://example.com/hook")).toThrow(
      "Webhook URL must use HTTPS (HTTP allowed only for localhost in non-production)."
    );
    expect(() => normalizeWebhookUrl("https://localhost/hook")).toThrow("Webhook URL host is not allowed.");
    expect(() => normalizeWebhookUrl("https://127.0.0.1/hook")).toThrow("Webhook URL host is not allowed.");
    expect(() => normalizeWebhookUrl("https://192.168.1.7/hook")).toThrow("Webhook URL host is not allowed.");
    expect(() => normalizeWebhookUrl("https://user:pass@example.com/hook")).toThrow(
      "Webhook URL must not contain credentials."
    );
  });

  test("allows localhost http only outside production", () => {
    const out = normalizeWebhookUrl("http://localhost:8787/hook", toProcessEnv({ NODE_ENV: "development" }));
    expect(out).toBe("http://localhost:8787/hook");

    expect(() => normalizeWebhookUrl("http://localhost:8787/hook", toProcessEnv({ NODE_ENV: "production" }))).toThrow(
      "Webhook URL must use HTTPS (HTTP allowed only for localhost in non-production)."
    );
  });

  test("webhook actions normalize and validate URL input", () => {
    const code = readFileSync("src/app/admin/(owner)/webhooks/actions.ts", "utf8");
    expect(code.includes("normalizeWebhookUrl(")).toBeTruthy();
    expect(code.includes("encryptWebhookSecretForStorage(")).toBeTruthy();
  });

  test("webhook edit page does not render stored secret values", () => {
    const code = readFileSync("src/app/admin/(owner)/webhooks/page.tsx", "utf8");
    expect(code.includes("defaultValue={h.secret")).toBeFalsy();
    expect(code.includes("Leave blank to keep current secret")).toBeTruthy();
  });
});
