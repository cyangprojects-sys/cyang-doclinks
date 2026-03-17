import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function src(file: string): string {
  return readFileSync(file, "utf8");
}

test.describe("public runtime config guardrails", () => {
  test("public runtime config stays env-backed and db-free", () => {
    const code = src("src/lib/publicRuntimeConfig.ts");
    expect(code.includes("@/lib/db")).toBeFalsy();
    expect(code.includes("@/lib/settings")).toBeFalsy();
    expect(code.includes("@/lib/signup")).toBeFalsy();
    expect(code.includes("pricingUiEnabled()")).toBeTruthy();
  });

  test("public shell and marketing pages do not read billing flags directly", () => {
    const files = [
      "src/app/components/SiteHeader.tsx",
      "src/app/components/SiteFooter.tsx",
      "src/app/components/SiteShell.tsx",
      "src/app/page.tsx",
      "src/app/about/page.tsx",
      "src/app/contact/page.tsx",
      "src/app/pricing/page.tsx",
      "src/app/projects/doclinks/page.tsx",
    ];

    for (const file of files) {
      const code = src(file);
      expect(code.includes("getBillingFlags(")).toBeFalsy();
      expect(code.includes("@/lib/settings")).toBeFalsy();
    }
  });
});
