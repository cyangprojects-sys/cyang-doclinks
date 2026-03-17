import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { DEMO_DOC_URL } from "../src/lib/demo";

test.describe("demo document link regression", () => {
  test("demo URL is optional and only resolves to a gated share page when configured", () => {
    if (!DEMO_DOC_URL) {
      expect(DEMO_DOC_URL).toBeNull();
      return;
    }
    expect(DEMO_DOC_URL.startsWith("https://www.cyang.io/s/")).toBeTruthy();
    expect(DEMO_DOC_URL.includes("/raw")).toBeFalsy();
  });

  test("demo config no longer hard-codes a canonical production share token", async () => {
    const code = await readFile("src/lib/demo.ts", "utf8");
    expect(code.includes("CANONICAL_DEMO_DOC_URL")).toBeFalsy();
    expect(code.includes("getConfiguredDemoDocUrl")).toBeTruthy();
  });
});
