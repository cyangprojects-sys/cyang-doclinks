import { expect, test } from "@playwright/test";
import { slugify as aliasSlugify } from "../src/lib/alias";
import { slugify as docSlugify } from "../src/lib/slug";

test.describe("slug sanitization helpers", () => {
  test("alias slugify normalizes unsafe input and fails closed to doc", () => {
    expect(aliasSlugify("  My Report (Q4) 2026.pdf  ")).toBe("my-report-q4-2026-pdf");
    expect(aliasSlugify("../../../etc/passwd")).toBe("etc-passwd");
    expect(aliasSlugify("<script>alert(1)</script>")).toBe("script-alert-1-script");
    expect(aliasSlugify("''\"\"")).toBe("doc");
    expect(aliasSlugify("")).toBe("doc");
  });

  test("doc slugify strips .pdf suffix and clamps length", () => {
    expect(docSlugify("Quarterly Plan.PDF")).toBe("quarterly-plan");
    expect(docSlugify("  weird__name---v2!!.pdf  ")).toBe("weird-name-v2");

    const long = "a".repeat(200);
    expect(docSlugify(long)).toHaveLength(80);
  });
});
