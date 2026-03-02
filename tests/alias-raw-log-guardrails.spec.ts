import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("alias raw log guardrails", () => {
  test("public alias raw route avoids dumping raw error objects in production logs", () => {
    const code = readFileSync("src/app/d/[alias]/raw/route.ts", "utf8");
    expect(code.includes("console.error(\"RAW ROUTE ERROR:\"")).toBeFalsy();
    expect(code.includes("console.warn(\"RAW ROUTE ERROR\")")).toBeTruthy();
  });
});
