import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { DEMO_DOC_URL } from "../src/lib/demo";

test.describe("demo document link regression", () => {
  test("canonical demo URL points to gated share page (not direct raw)", () => {
    expect(DEMO_DOC_URL.startsWith("https://www.cyang.io/s/")).toBeTruthy();
    expect(DEMO_DOC_URL.includes("/raw")).toBeFalsy();
  });

  test("demo link constant remains isolated from raw-download paths", async () => {
    const code = await readFile("src/lib/demo.ts", "utf8");
    expect(code.includes("CANONICAL_DEMO_DOC_URL")).toBeTruthy();
    expect(code.includes("assertSafeDemoDocUrl")).toBeTruthy();
  });
});
