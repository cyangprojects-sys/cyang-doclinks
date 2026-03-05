import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("d/[alias] action and raw route guardrails", () => {
  test("share action validates doc ids and token formats before UUID-cast SQL", () => {
    const code = readFileSync("src/app/d/[alias]/actions.ts", "utf8");
    expect(code.includes("UUID_RE")).toBeTruthy();
    expect(code.includes("SHARE_TOKEN_RE")).toBeTruthy();
    expect(code.includes("if (!isUuid(docId))")).toBeTruthy();
    expect(code.includes("if (!isShareToken(tokenValue))")).toBeTruthy();
  });

  test("alias raw route normalizes aliases with decode failure handling", () => {
    const code = readFileSync("src/app/d/[alias]/raw/route.ts", "utf8");
    expect(code.includes("function normalizeAlias(")).toBeTruthy();
    expect(code.includes("decodeURIComponent")).toBeTruthy();
    expect(code.includes("catch {")).toBeTruthy();
  });
});
