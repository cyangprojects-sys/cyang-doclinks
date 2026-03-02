import { expect, test } from "@playwright/test";
import { getDmcaEmail, getPrivacyEmail, getSecurityEmail, getSupportEmail } from "../src/lib/legal";

const ENV_KEYS = [
  "SUPPORT_EMAIL",
  "CONTACT_EMAIL",
  "DMCA_EMAIL",
  "DMCA_CONTACT_EMAIL",
  "PRIVACY_EMAIL",
  "SECURITY_EMAIL",
  "RESPONSIBLE_DISCLOSURE_EMAIL",
] as const;

type Snapshot = Record<(typeof ENV_KEYS)[number], string | undefined>;

function setEnv(name: string, value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (typeof value === "undefined") delete env[name];
  else env[name] = value;
}

function takeSnapshot(): Snapshot {
  return {
    SUPPORT_EMAIL: process.env.SUPPORT_EMAIL,
    CONTACT_EMAIL: process.env.CONTACT_EMAIL,
    DMCA_EMAIL: process.env.DMCA_EMAIL,
    DMCA_CONTACT_EMAIL: process.env.DMCA_CONTACT_EMAIL,
    PRIVACY_EMAIL: process.env.PRIVACY_EMAIL,
    SECURITY_EMAIL: process.env.SECURITY_EMAIL,
    RESPONSIBLE_DISCLOSURE_EMAIL: process.env.RESPONSIBLE_DISCLOSURE_EMAIL,
  };
}

function restoreSnapshot(s: Snapshot) {
  for (const k of ENV_KEYS) setEnv(k, s[k]);
}

test.describe("legal email helpers", () => {
  let snapshot: Snapshot;

  test.beforeEach(() => {
    snapshot = takeSnapshot();
  });

  test.afterEach(() => {
    restoreSnapshot(snapshot);
  });

  test("defaults to support@cyang.io when no env emails are valid", () => {
    for (const k of ENV_KEYS) setEnv(k, undefined);
    expect(getSupportEmail()).toBe("support@cyang.io");
    expect(getDmcaEmail()).toBe("support@cyang.io");
    expect(getPrivacyEmail()).toBe("support@cyang.io");
    expect(getSecurityEmail()).toBe("support@cyang.io");
  });

  test("normalizes support/contact emails and prefers SUPPORT_EMAIL", () => {
    setEnv("SUPPORT_EMAIL", "  Support@Example.COM ");
    setEnv("CONTACT_EMAIL", "contact@example.com");
    expect(getSupportEmail()).toBe("support@example.com");
  });

  test("uses CONTACT_EMAIL when SUPPORT_EMAIL is invalid", () => {
    setEnv("SUPPORT_EMAIL", "not-an-email");
    setEnv("CONTACT_EMAIL", " Contact@Example.com ");
    expect(getSupportEmail()).toBe("contact@example.com");
  });

  test("resolves DMCA, privacy, and security env precedence with fallback to support", () => {
    setEnv("SUPPORT_EMAIL", "support@example.com");
    setEnv("DMCA_EMAIL", "dmca@example.com");
    setEnv("DMCA_CONTACT_EMAIL", "dmca-contact@example.com");
    setEnv("PRIVACY_EMAIL", "privacy@example.com");
    setEnv("SECURITY_EMAIL", "security@example.com");
    setEnv("RESPONSIBLE_DISCLOSURE_EMAIL", "rd@example.com");

    expect(getDmcaEmail()).toBe("dmca@example.com");
    expect(getPrivacyEmail()).toBe("privacy@example.com");
    expect(getSecurityEmail()).toBe("security@example.com");
  });

  test("falls back to secondary/ support emails when primary values are invalid", () => {
    setEnv("SUPPORT_EMAIL", "support@example.com");
    setEnv("DMCA_EMAIL", "bad");
    setEnv("DMCA_CONTACT_EMAIL", "dmca-contact@example.com");
    setEnv("PRIVACY_EMAIL", "bad");
    setEnv("SECURITY_EMAIL", "bad");
    setEnv("RESPONSIBLE_DISCLOSURE_EMAIL", "rd@example.com");

    expect(getDmcaEmail()).toBe("dmca-contact@example.com");
    expect(getPrivacyEmail()).toBe("support@example.com");
    expect(getSecurityEmail()).toBe("rd@example.com");
  });
});
