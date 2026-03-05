import { expect, test } from "@playwright/test";
import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  shouldForceSse,
  validateDocMasterKeysConfig,
  wrapDataKey,
} from "../src/lib/encryption";

const ENV_SNAPSHOT = {
  DOC_MASTER_KEYS: process.env.DOC_MASTER_KEYS,
  R2_FORCE_SSE: process.env.R2_FORCE_SSE,
  FORCE_R2_SSE: process.env.FORCE_R2_SSE,
};

test.afterEach(() => {
  if (typeof ENV_SNAPSHOT.DOC_MASTER_KEYS === "undefined") delete process.env.DOC_MASTER_KEYS;
  else process.env.DOC_MASTER_KEYS = ENV_SNAPSHOT.DOC_MASTER_KEYS;

  if (typeof ENV_SNAPSHOT.R2_FORCE_SSE === "undefined") delete process.env.R2_FORCE_SSE;
  else process.env.R2_FORCE_SSE = ENV_SNAPSHOT.R2_FORCE_SSE;

  if (typeof ENV_SNAPSHOT.FORCE_R2_SSE === "undefined") delete process.env.FORCE_R2_SSE;
  else process.env.FORCE_R2_SSE = ENV_SNAPSHOT.FORCE_R2_SSE;
});

test.describe("encryption guardrails", () => {
  test("rejects invalid master-key ids and oversized key lists", () => {
    const validKey = Buffer.alloc(32, 7).toString("base64");
    const badId = validateDocMasterKeysConfig(JSON.stringify([{ id: "../k1", key_b64: validKey, active: true }]));
    expect(badId.ok).toBeFalsy();

    const many = Array.from({ length: 40 }, (_, i) => ({ id: `k${i}`, key_b64: validKey, active: i === 0 }));
    const tooMany = validateDocMasterKeysConfig(JSON.stringify(many));
    expect(tooMany.ok).toBeFalsy();
  });

  test("fails closed on control characters in SSE toggle values", () => {
    process.env.R2_FORCE_SSE = "true\n";
    delete process.env.FORCE_R2_SSE;
    expect(shouldForceSse()).toBeFalsy();
  });

  test("validates AES buffer lengths before crypto operations", () => {
    const key = Buffer.alloc(32, 1);
    const iv = Buffer.alloc(12, 2);

    expect(() => encryptAes256Gcm({ plaintext: Buffer.alloc(0), iv, key })).toThrow(/Invalid plaintext/);
    expect(() => wrapDataKey({ dataKey: Buffer.alloc(8, 1), masterKey: key })).toThrow(/Invalid data key/);
    expect(() => decryptAes256Gcm({ ciphertext: Buffer.alloc(20, 1), iv: Buffer.alloc(8, 2), key })).toThrow(/Invalid IV length/);
  });
});
