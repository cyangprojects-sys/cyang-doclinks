import { expect, test } from "@playwright/test";
import { decryptWebhookSecretForUse, encryptWebhookSecretForStorage, isEncryptedSecretFormat } from "../src/lib/webhookSecrets";

test.describe("webhook secret helpers", () => {
  test("legacy plaintext secrets are still readable for backward compatibility", () => {
    expect(decryptWebhookSecretForUse("legacy-secret")).toBe("legacy-secret");
  });

  test("encrypts and decrypts webhook secret when OIDC_SECRETS_KEY is configured", () => {
    const old = process.env.OIDC_SECRETS_KEY;
    process.env.OIDC_SECRETS_KEY = Buffer.alloc(32, 7).toString("base64");
    try {
      const stored = encryptWebhookSecretForStorage("whsec_123");
      expect(isEncryptedSecretFormat(stored)).toBeTruthy();
      expect(decryptWebhookSecretForUse(stored)).toBe("whsec_123");
    } finally {
      if (typeof old === "string") process.env.OIDC_SECRETS_KEY = old;
      else delete process.env.OIDC_SECRETS_KEY;
    }
  });
});

