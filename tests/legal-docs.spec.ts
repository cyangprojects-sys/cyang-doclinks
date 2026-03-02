import { expect, test } from "@playwright/test";
import { getLegalDocBySlug, LEGAL_DOCS, readLegalDocMarkdown } from "../src/lib/legalDocs";

test.describe("legal docs helpers", () => {
  test("returns known docs by slug and null for unknown", () => {
    expect(LEGAL_DOCS.length).toBeGreaterThan(0);
    const doc = getLegalDocBySlug("terms-of-service");
    expect(doc).not.toBeNull();
    expect(doc?.file).toBe("TERMS_OF_SERVICE.md");
    expect(getLegalDocBySlug("not-a-real-doc")).toBeNull();
  });

  test("reads markdown for known legal docs", async () => {
    const markdown = await readLegalDocMarkdown("TERMS_OF_SERVICE.md");
    expect(markdown.length).toBeGreaterThan(50);
    expect(markdown.toLowerCase()).toContain("terms");
  });

  test("rejects path traversal and invalid filenames", async () => {
    await expect(readLegalDocMarkdown("../package.json")).rejects.toThrow("INVALID_LEGAL_DOC_FILE");
    await expect(readLegalDocMarkdown("nested/TERMS_OF_SERVICE.md")).rejects.toThrow("INVALID_LEGAL_DOC_FILE");
    await expect(readLegalDocMarkdown("TERMS_OF_SERVICE")).rejects.toThrow("INVALID_LEGAL_DOC_FILE");
    await expect(readLegalDocMarkdown("")).rejects.toThrow("INVALID_LEGAL_DOC_FILE");
  });
});
