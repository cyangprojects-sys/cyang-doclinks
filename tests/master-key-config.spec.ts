import { expect, test } from "@playwright/test";
import { getActiveMasterKey, validateDocMasterKeysConfig } from "../src/lib/encryption";

const VALID_KEY = Buffer.alloc(32, 3).toString("base64");

test.describe("master key config validation", () => {
  const snap = process.env.DOC_MASTER_KEYS;

  test.afterEach(() => {
    if (typeof snap === "string") process.env.DOC_MASTER_KEYS = snap;
    else Reflect.deleteProperty(process.env, "DOC_MASTER_KEYS");
  });

  test("accepts a valid master-key JSON array", () => {
    const raw = JSON.stringify([{ id: "k1", key_b64: VALID_KEY, active: true }]);
    expect(validateDocMasterKeysConfig(raw)).toEqual({ ok: true });
    process.env.DOC_MASTER_KEYS = raw;
    expect(getActiveMasterKey().id).toBe("k1");
  });

  test("rejects duplicate ids and multiple active keys", () => {
    const dup = JSON.stringify([
      { id: "k1", key_b64: VALID_KEY, active: true },
      { id: "k1", key_b64: VALID_KEY, active: false },
    ]);
    const dupRes = validateDocMasterKeysConfig(dup);
    expect(dupRes.ok).toBeFalsy();

    const multiActive = JSON.stringify([
      { id: "k1", key_b64: VALID_KEY, active: true },
      { id: "k2", key_b64: VALID_KEY, active: true },
    ]);
    const activeRes = validateDocMasterKeysConfig(multiActive);
    expect(activeRes.ok).toBeFalsy();
  });

  test("fails closed for malformed or invalid-length keys", () => {
    const malformed = validateDocMasterKeysConfig("{not-json");
    expect(malformed.ok).toBeFalsy();

    const badLen = validateDocMasterKeysConfig(
      JSON.stringify([{ id: "k1", key_b64: Buffer.alloc(8).toString("base64"), active: true }])
    );
    expect(badLen.ok).toBeFalsy();
  });
});
