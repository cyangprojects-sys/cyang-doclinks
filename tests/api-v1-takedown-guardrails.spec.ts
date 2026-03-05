import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("api v1 takedown guardrails", () => {
  test("takedown route validates doc_id shape before uuid casting", () => {
    const code = readFileSync("src/app/api/v1/takedown/route.ts", "utf8");
    expect(code.includes("UUID_RE")).toBeTruthy();
    expect(code.includes("INVALID_DOC_ID")).toBeTruthy();
    expect(code.includes("MAX_TAKEDOWN_BODY_BYTES")).toBeTruthy();
    expect(code.includes("INVALID_TOKEN")).toBeTruthy();
    expect(code.includes("INVALID_ALIAS")).toBeTruthy();
    expect(code.includes("INVALID_REQUESTER_EMAIL")).toBeTruthy();
  });
});
