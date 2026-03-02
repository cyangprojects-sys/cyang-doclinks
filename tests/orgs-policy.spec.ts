import { expect, test } from "@playwright/test";
import { encryptSecret } from "../src/lib/cryptoSecrets";
import { getDecryptedClientSecret, orgAllowsEmail, type Org } from "../src/lib/orgs";

function mkOrg(overrides?: Partial<Org>): Org {
  return {
    id: "org-id",
    slug: "acme",
    name: "Acme",
    oidcEnabled: true,
    oidcIssuer: "https://issuer.example",
    oidcClientId: "client-id",
    oidcClientSecretEnc: null,
    allowedDomains: [],
    ...(overrides || {}),
  };
}

test.describe("org policy helpers", () => {
  const prev = process.env.OIDC_SECRETS_KEY;

  test.afterEach(() => {
    if (typeof prev === "undefined") delete process.env.OIDC_SECRETS_KEY;
    else process.env.OIDC_SECRETS_KEY = prev;
  });

  test("orgAllowsEmail allows all when allowedDomains is empty", () => {
    const org = mkOrg({ allowedDomains: [] });
    expect(orgAllowsEmail(org, "user@example.com")).toBeTruthy();
    expect(orgAllowsEmail(org, " USER@Example.com ")).toBeTruthy();
    expect(orgAllowsEmail(org, "")).toBeFalsy();
  });

  test("orgAllowsEmail enforces explicit domain allow-list", () => {
    const org = mkOrg({ allowedDomains: ["acme.com", "example.org"] });
    expect(orgAllowsEmail(org, "user@acme.com")).toBeTruthy();
    expect(orgAllowsEmail(org, "user@example.org")).toBeTruthy();
    expect(orgAllowsEmail(org, "user@other.com")).toBeFalsy();
  });

  test("decrypts configured OIDC client secret and returns null when missing", () => {
    process.env.OIDC_SECRETS_KEY = Buffer.alloc(32, 7).toString("base64");
    const secret = "super-oidc-secret";
    const encrypted = encryptSecret(secret);
    const org = mkOrg({ oidcClientSecretEnc: encrypted });
    expect(getDecryptedClientSecret(org)).toBe(secret);
    expect(getDecryptedClientSecret(mkOrg({ oidcClientSecretEnc: null }))).toBeNull();
  });
});
