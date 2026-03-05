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

  test("filters invalid key ids, normalizes case, and caps list size", () => {
    const ids = Array.from({ length: 80 }, (_, i) => `K_${i}`).join(",");
    const out = parseAutomatedKeyRotationConfig(
      toProcessEnv({
        AUTO_KEY_ROTATE_FROM: `k1, bad/id, K2, .., ${ids}, k1`,
      })
    );
    expect(out.fromIds[0]).toBe("k1");
    expect(out.fromIds[1]).toBe("k2");
    expect(out.fromIds.some((id) => id.includes("/"))).toBeFalsy();
    expect(out.fromIds.length).toBeLessThanOrEqual(64);
  });

  test("fails closed when control characters are present in config values", () => {
    const out = parseAutomatedKeyRotationConfig(
      toProcessEnv({
        AUTO_KEY_ROTATION_ENABLED: "yes\n",
        AUTO_KEY_ROTATE_FROM: "k1,\nk2",
        AUTO_KEY_ROTATE_BATCH: "50\r\n",
      })
    );
    expect(out.enabled).toBeFalsy();
    expect(out.fromIds).toEqual([]);
    expect(out.limit).toBe(250);
  });
});
