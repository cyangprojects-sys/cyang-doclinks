import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { stampPdfWithWatermark } from "../src/lib/pdfWatermark";

const SPEC = {
  identity: { kind: "known" as const, label: "viewer@example.com" },
  timestampIso: "2026-01-01T00:00:00.000Z",
  shareIdShort: "sh123",
  docIdShort: "doc123",
  sharedBy: "owner@example.com",
  openedBy: "viewer@example.com",
};

test.describe("pdf watermark guardrails", () => {
  test("rejects empty and oversized inputs before parsing", async () => {
    await expect(stampPdfWithWatermark(Buffer.alloc(0), SPEC)).rejects.toThrow(/INVALID_PDF_INPUT/);
    await expect(stampPdfWithWatermark(Buffer.alloc(50 * 1024 * 1024 + 1, 1), SPEC)).rejects.toThrow(/PDF_TOO_LARGE/);
  });

  test("rejects PDFs with excessive page counts", async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 1001; i += 1) {
      doc.addPage([32, 32]);
    }
    const bytes = Buffer.from(await doc.save());
    await expect(stampPdfWithWatermark(bytes, SPEC)).rejects.toThrow(/PDF_PAGE_LIMIT_EXCEEDED/);
  });
});
