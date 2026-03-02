import { expect, test } from "@playwright/test";
import { parseAutomatedKeyRotationConfig } from "../src/lib/keyRotation";

function toProcessEnv(vars: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return vars as unknown as NodeJS.ProcessEnv;
}

test.describe("automated key rotation config parsing", () => {
  test("parses enable flag and from-id list", () => {
    const out = parseAutomatedKeyRotationConfig(toProcessEnv({
      AUTO_KEY_ROTATION_ENABLED: "yes",
      AUTO_KEY_ROTATE_FROM: " k1, k2 ,, k3, k2, k1 ",
    }));
    expect(out.enabled).toBeTruthy();
    expect(out.fromIds).toEqual(["k1", "k2", "k3"]);
    expect(out.limit).toBe(250);
  });

  test("disables for unknown enable value", () => {
    const out = parseAutomatedKeyRotationConfig(toProcessEnv({
      AUTO_KEY_ROTATION_ENABLED: "garbage",
      AUTO_KEY_ROTATE_FROM: "k1",
    }));
    expect(out.enabled).toBeFalsy();
  });

  test("clamps batch size and falls back on invalid numbers", () => {
    const low = parseAutomatedKeyRotationConfig(toProcessEnv({ AUTO_KEY_ROTATE_BATCH: "0" }));
    expect(low.limit).toBe(1);

    const high = parseAutomatedKeyRotationConfig(toProcessEnv({ AUTO_KEY_ROTATE_BATCH: "999999" }));
    expect(high.limit).toBe(2000);

    const invalid = parseAutomatedKeyRotationConfig(toProcessEnv({ AUTO_KEY_ROTATE_BATCH: "NaN" }));
    expect(invalid.limit).toBe(250);
  });
});
