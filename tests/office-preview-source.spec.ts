import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolveOfficePreviewRawSource } from "../src/lib/officePreviewSource";

test.describe("office preview source", () => {
  test("parses only supported raw source paths", () => {
    expect(resolveOfficePreviewRawSource("/s/abc123/raw")).toEqual({ kind: "share", token: "abc123" });
    expect(resolveOfficePreviewRawSource("/d/vendor-contract/raw")).toEqual({
      kind: "alias",
      alias: "vendor-contract",
    });
    expect(resolveOfficePreviewRawSource("/s/abc123")).toBeNull();
    expect(resolveOfficePreviewRawSource("/api/health")).toBeNull();
  });

  test("stays in-process and does not loop back over HTTP", () => {
    const code = readFileSync("src/lib/officePreviewSource.ts", "utf8");
    expect(code.includes('from "@/app/d/[alias]/raw/route"')).toBeTruthy();
    expect(code.includes('from "@/app/s/[token]/raw/route"')).toBeTruthy();
    expect(code.includes('from "@/app/t/[ticketId]/route"')).toBeTruthy();
    expect(code.includes("fetch(")).toBeFalsy();
  });
});
