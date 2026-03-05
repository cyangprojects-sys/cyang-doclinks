import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("admin doc detail guardrails", () => {
  test("admin doc detail route validates UUID params and encodes alias links", () => {
    const code = readFileSync("src/app/admin/docs/[docId]/page.tsx", "utf8");
    expect(code.includes("const UUID_RE =")).toBeTruthy();
    expect(code.includes("if (!docId || !isUuid(docId)) notFound();")).toBeTruthy();
    expect(code.includes("encodeURIComponent(alias)")).toBeTruthy();
  });
});
