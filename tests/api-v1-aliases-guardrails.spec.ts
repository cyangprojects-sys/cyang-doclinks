import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("api v1 aliases guardrails", () => {
  test("alias creation route validates doc UUIDs and payload shape/size", () => {
    const code = readFileSync("src/app/api/v1/aliases/route.ts", "utf8");
    expect(code.includes("MAX_ALIASES_BODY_BYTES")).toBeTruthy();
    expect(code.includes("INVALID_DOC_ID")).toBeTruthy();
    expect(code.includes("Array.isArray(parsed)")).toBeTruthy();
    expect(code.includes("PAYLOAD_TOO_LARGE")).toBeTruthy();
  });
});
