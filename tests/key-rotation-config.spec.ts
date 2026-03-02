import { expect, test } from "@playwright/test";
import { parseAutomatedKeyRotationConfig } from "../src/lib/keyRotation";

test.describe("automated key rotation config parsing", () => {
  test("parses enable flag and from-id list", () => {
    const out = parseAutomatedKeyRotationConfig({
      AUTO_KEY_ROTATION_ENABLED: "yes",
      AUTO_KEY_ROTATE_FROM: " k1, k2 ,, k3 ",
    } as NodeJS.ProcessEnv);
    expect(out.enabled).toBeTruthy();
    expect(out.fromIds).toEqual(["k1", "k2", "k3"]);
    expect(out.limit).toBe(250);
  });

  test("disables for unknown enable value", () => {
    const out = parseAutomatedKeyRotationConfig({
      AUTO_KEY_ROTATION_ENABLED: "garbage",
      AUTO_KEY_ROTATE_FROM: "k1",
    } as NodeJS.ProcessEnv);
    expect(out.enabled).toBeFalsy();
  });

  test("clamps batch size and falls back on invalid numbers", () => {
    const low = parseAutomatedKeyRotationConfig({ AUTO_KEY_ROTATE_BATCH: "0" } as NodeJS.ProcessEnv);
    expect(low.limit).toBe(1);

    const high = parseAutomatedKeyRotationConfig({ AUTO_KEY_ROTATE_BATCH: "999999" } as NodeJS.ProcessEnv);
    expect(high.limit).toBe(2000);

    const invalid = parseAutomatedKeyRotationConfig({ AUTO_KEY_ROTATE_BATCH: "NaN" } as NodeJS.ProcessEnv);
    expect(invalid.limit).toBe(250);
  });
});
