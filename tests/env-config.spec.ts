import { expect, test } from "@playwright/test";
import {
  getDmcaEmailEnv,
  getR2BucketEnv,
  getSecurityEmailEnv,
  getSupportEmailEnv,
  getViewBindingSecret,
} from "../src/lib/envConfig";

const SNAPSHOT = {
  SUPPORT_EMAIL: process.env.SUPPORT_EMAIL,
  CONTACT_EMAIL: process.env.CONTACT_EMAIL,
  SECURITY_EMAIL: process.env.SECURITY_EMAIL,
  RESPONSIBLE_DISCLOSURE_EMAIL: process.env.RESPONSIBLE_DISCLOSURE_EMAIL,
  DMCA_EMAIL: process.env.DMCA_EMAIL,
  DMCA_CONTACT_EMAIL: process.env.DMCA_CONTACT_EMAIL,
  R2_BUCKET: process.env.R2_BUCKET,
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
  VIEW_SALT: process.env.VIEW_SALT,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(SNAPSHOT)) {
    if (typeof value === "undefined") delete process.env[key];
    else process.env[key] = value;
  }
}

test.afterEach(() => {
  restoreEnv();
});

test("preferred env helpers honor preferred names before legacy aliases", () => {
  process.env.SUPPORT_EMAIL = "support@example.com";
  process.env.CONTACT_EMAIL = "contact@example.com";
  process.env.SECURITY_EMAIL = "security@example.com";
  process.env.RESPONSIBLE_DISCLOSURE_EMAIL = "legacy-security@example.com";
  process.env.DMCA_EMAIL = "dmca@example.com";
  process.env.DMCA_CONTACT_EMAIL = "legacy-dmca@example.com";
  process.env.R2_BUCKET = "primary-bucket";
  process.env.R2_BUCKET_NAME = "legacy-bucket";
  process.env.VIEW_SALT = "view-salt";
  process.env.NEXTAUTH_SECRET = "nextauth-secret";

  expect(getSupportEmailEnv()).toBe("support@example.com");
  expect(getSecurityEmailEnv()).toBe("security@example.com");
  expect(getDmcaEmailEnv()).toBe("dmca@example.com");
  expect(getR2BucketEnv()).toBe("primary-bucket");
  expect(getViewBindingSecret()).toBe("view-salt");
});

test("preferred env helpers fall back to legacy aliases when needed", () => {
  delete process.env.SUPPORT_EMAIL;
  process.env.CONTACT_EMAIL = "contact@example.com";
  delete process.env.SECURITY_EMAIL;
  process.env.RESPONSIBLE_DISCLOSURE_EMAIL = "legacy-security@example.com";
  delete process.env.DMCA_EMAIL;
  process.env.DMCA_CONTACT_EMAIL = "legacy-dmca@example.com";
  delete process.env.R2_BUCKET;
  process.env.R2_BUCKET_NAME = "legacy-bucket";
  delete process.env.VIEW_SALT;
  process.env.NEXTAUTH_SECRET = "nextauth-secret";

  expect(getSupportEmailEnv()).toBe("contact@example.com");
  expect(getSecurityEmailEnv()).toBe("legacy-security@example.com");
  expect(getDmcaEmailEnv()).toBe("legacy-dmca@example.com");
  expect(getR2BucketEnv()).toBe("legacy-bucket");
  expect(getViewBindingSecret()).toBe("nextauth-secret");
});
