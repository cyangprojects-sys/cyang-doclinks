import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import * as admin from "../src/lib/admin";
import { requireOwner as requireOwnerAuth } from "../src/lib/auth";
import { getOwnerEmail, roleAtLeast } from "../src/lib/authz";
import { logCronRun } from "../src/lib/cronTelemetry";
import { sql } from "../src/lib/db";
import { sendMail } from "../src/lib/email";
import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  generateDataKey,
  generateIv,
  getActiveMasterKey,
  shouldForceSse,
  unwrapDataKey,
  wrapDataKey,
} from "../src/lib/encryption";
import { migrateLegacyEncryptionBatch } from "../src/lib/encryptionMigration";
import { sendExpirationAlerts } from "../src/lib/expirationAlerts";
import { appendImmutableAudit } from "../src/lib/immutableAudit";
import { enqueueKeyRotationJob, listKeyRotationJobs, processKeyRotationJobs } from "../src/lib/keyRotationJobs";
import { logAccess } from "../src/lib/logAccess";
import { scanR2Object } from "../src/lib/malwareScan";
import { getEffectiveActiveMasterKeyId, listMasterKeysWithStatus } from "../src/lib/masterKeys";
import { googleRedirectUri } from "../src/lib/oauth-google";
import { createOrgInviteToken, hashInviteToken } from "../src/lib/orgMembership";
import { requireOwner as requireOwnerLegacy } from "../src/lib/owner";
import { validatePdfBuffer } from "../src/lib/pdfSafety";
import { stampPdfWithWatermark } from "../src/lib/pdfWatermark";
import { createQuarantineOverride, hasActiveQuarantineOverride } from "../src/lib/quarantineOverride";
import { getR2Bucket, getR2Prefix } from "../src/lib/r2";
import { runR2OrphanSweep } from "../src/lib/retention";
import { revokeExpiredSharesBatch } from "../src/lib/shareLifecycle";

const ENV_SNAPSHOT = {
  DATABASE_URL: process.env.DATABASE_URL,
  OWNER_EMAIL: process.env.OWNER_EMAIL,
  OWNER_EMAILS: process.env.OWNER_EMAILS,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  DOC_MASTER_KEYS: process.env.DOC_MASTER_KEYS,
  R2_FORCE_SSE: process.env.R2_FORCE_SSE,
  FORCE_R2_SSE: process.env.FORCE_R2_SSE,
  R2_BUCKET: process.env.R2_BUCKET,
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
  R2_PREFIX: process.env.R2_PREFIX,
  APP_URL: process.env.APP_URL,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  VIEW_SALT: process.env.VIEW_SALT,
};

test.afterEach(() => {
  const restore = (name: keyof typeof ENV_SNAPSHOT) => {
    const value = ENV_SNAPSHOT[name];
    if (typeof value === "undefined") delete process.env[name];
    else process.env[name] = value;
  };
  restore("DATABASE_URL");
  restore("OWNER_EMAIL");
  restore("OWNER_EMAILS");
  restore("RESEND_API_KEY");
  restore("EMAIL_FROM");
  restore("DOC_MASTER_KEYS");
  restore("R2_FORCE_SSE");
  restore("FORCE_R2_SSE");
  restore("R2_BUCKET");
  restore("R2_BUCKET_NAME");
  restore("R2_PREFIX");
  restore("APP_URL");
  restore("NEXTAUTH_SECRET");
  restore("VIEW_SALT");
});

function setDocMasterKeys() {
  const key = Buffer.alloc(32, 9).toString("base64");
  process.env.DOC_MASTER_KEYS = JSON.stringify([{ id: "k1", key_b64: key, active: true }]);
}

test.describe("remaining module sweep", () => {
  test("auth/admin/owner exports and role helpers are wired", async () => {
    process.env.OWNER_EMAILS = "owner1@example.com,owner2@example.com";
    expect(getOwnerEmail()).toBe("owner1@example.com");
    expect(roleAtLeast("owner", "admin")).toBeTruthy();
    expect(roleAtLeast("viewer", "admin")).toBeFalsy();

    expect(typeof admin.getRole).toBe("function");
    expect(typeof admin.requireOwnerAdmin).toBe("function");
    expect(typeof requireOwnerAuth).toBe("function");
    expect(typeof requireOwnerLegacy).toBe("function");
  });

  test("db and r2 helpers fail closed without required env", async () => {
    delete process.env.DATABASE_URL;
    expect(() => sql`select 1`).toThrow(/Missing DATABASE_URL/);

    delete process.env.R2_BUCKET;
    delete process.env.R2_BUCKET_NAME;
    expect(() => getR2Bucket()).toThrow(/Missing R2_BUCKET env var/);

    process.env.R2_PREFIX = "tenant-a";
    expect(getR2Prefix()).toBe("tenant-a/");
    process.env.R2_PREFIX = "r2://bad-prefix";
    expect(getR2Prefix()).toBe("docs/");
  });

  test("encryption helpers round-trip and enforce toggles", () => {
    setDocMasterKeys();
    const active = getActiveMasterKey();
    expect(active.id).toBe("k1");
    expect(active.key).toHaveLength(32);

    const plaintext = Buffer.from("secret-doc-bytes");
    const dataKey = generateDataKey();
    const iv = generateIv();
    expect(dataKey).toHaveLength(32);
    expect(iv).toHaveLength(12);

    const wrap = wrapDataKey({ dataKey, masterKey: active.key });
    const unwrapped = unwrapDataKey({
      wrapped: wrap.wrapped,
      wrapIv: wrap.iv,
      wrapTag: wrap.tag,
      masterKey: active.key,
    });
    expect(unwrapped.equals(dataKey)).toBeTruthy();

    const ct = encryptAes256Gcm({ plaintext, iv, key: dataKey });
    const pt = decryptAes256Gcm({ ciphertext: ct, iv, key: dataKey });
    expect(pt.equals(plaintext)).toBeTruthy();

    process.env.R2_FORCE_SSE = "true";
    expect(shouldForceSse()).toBeTruthy();
    process.env.R2_FORCE_SSE = "0";
    delete process.env.R2_FORCE_SSE;
    process.env.FORCE_R2_SSE = "yes";
    expect(shouldForceSse()).toBeTruthy();
  });

  test("alerts/key-rotation/master-keys fallback safely when DB is unavailable", async () => {
    delete process.env.DATABASE_URL;

    await expect(sendExpirationAlerts({ days: 0 })).resolves.toMatchObject({ days: 1 });

    await expect(listKeyRotationJobs(5)).resolves.toEqual([]);
    await expect(processKeyRotationJobs({ maxJobs: 2 })).resolves.toEqual({
      claimed: 0,
      processed: 0,
      results: [],
    });
    await expect(
      enqueueKeyRotationJob({ fromKeyId: "k1", toKeyId: "k2", requestedByUserId: null })
    ).rejects.toThrow(/MISSING_KEY_ROTATION_JOBS_TABLE/);

    setDocMasterKeys();
    await expect(getEffectiveActiveMasterKeyId()).resolves.toBe("k1");
    await expect(listMasterKeysWithStatus()).resolves.toEqual([
      { id: "k1", active: true, revoked: false },
    ]);
  });

  test("quarantine/share/db-writer helpers fail closed without DB", async () => {
    delete process.env.DATABASE_URL;
    await expect(hasActiveQuarantineOverride("")).resolves.toBeFalsy();
    await expect(
      createQuarantineOverride({ docId: "x", actorUserId: null, reason: "test", ttlMinutes: 5 })
    ).rejects.toThrow(/MISSING_QUARANTINE_OVERRIDE_TABLE/);

    await expect(revokeExpiredSharesBatch(10)).rejects.toThrow(/Missing DATABASE_URL/);
    await expect(logAccess({ docId: "d1", alias: null, token: null, ip: null, userAgent: null })).resolves.toBeUndefined();
    await expect(sendMail({ to: "u@example.com", subject: "s", text: "t" })).rejects.toThrow(/Missing env: RESEND_API_KEY/);
  });

  test("cron/audit helpers no-op on safe branches and strict mode propagates", async () => {
    await expect(logCronRun({ job: "", ok: true, durationMs: 12 })).resolves.toBeUndefined();
    await expect(appendImmutableAudit({ streamKey: "", action: "" })).resolves.toBeUndefined();

    delete process.env.DATABASE_URL;
    await expect(
      appendImmutableAudit(
        {
          streamKey: "doc:d1",
          action: "test",
          payload: { z: 1, a: 2 },
        },
        { strict: true }
      )
    ).rejects.toThrow(/Missing DATABASE_URL/);
  });

  test("pdf/org/google/migration modules enforce local validation", async () => {
    const invalidPdf = Buffer.from("not-a-pdf");
    const res = validatePdfBuffer({ bytes: invalidPdf });
    expect(res.ok).toBeFalsy();

    const doc = await PDFDocument.create();
    doc.addPage([300, 400]);
    const bytes = Buffer.from(await doc.save());
    const stamped = await stampPdfWithWatermark(bytes, {
      identity: { kind: "known", label: "viewer@example.com" },
      timestampIso: "2026-01-01T00:00:00.000Z",
      shareIdShort: "sh123",
      docIdShort: "doc123",
      sharedBy: "owner@example.com",
      openedBy: "viewer@example.com",
    });
    expect(stamped.length > bytes.length / 2).toBeTruthy();

    delete process.env.APP_URL;
    expect(() => googleRedirectUri()).toThrow(/Missing APP_URL/);

    delete process.env.NEXTAUTH_SECRET;
    delete process.env.VIEW_SALT;
    expect(() => hashInviteToken("token")).toThrow(/Missing NEXTAUTH_SECRET or VIEW_SALT/);
    expect(createOrgInviteToken().length > 10).toBeTruthy();

    delete process.env.R2_BUCKET;
    await expect(runR2OrphanSweep({ maxObjects: 10, deleteOrphans: false })).resolves.toMatchObject({ ok: false });
    await expect(migrateLegacyEncryptionBatch({ limit: 1, dryRun: true })).rejects.toThrow();

    expect(typeof scanR2Object).toBe("function");
  });
});
