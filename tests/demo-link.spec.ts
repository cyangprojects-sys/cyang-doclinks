import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { DEMO_DOC_URL } from "../src/lib/demo";

test.describe("demo document link regression", () => {
  test("canonical demo URL points to gated share page (not direct raw)", () => {
    expect(DEMO_DOC_URL).toBe("https://www.cyang.io/s/e7601639ef9e473fb38659988e4eaa18");
    expect(DEMO_DOC_URL.includes("/raw")).toBeFalsy();
  });

  test("public project pages import and use canonical demo URL constant", async () => {
    for (const file of ["src/app/projects/page.tsx", "src/app/projects/doclinks/page.tsx"]) {
      const src = await readFile(file, "utf8");
      expect(src).toContain('import { DEMO_DOC_URL } from "@/lib/demo"');
      expect(src).toContain("href={DEMO_DOC_URL}");
      expect(src).not.toContain("/raw");
    }
  });
});
