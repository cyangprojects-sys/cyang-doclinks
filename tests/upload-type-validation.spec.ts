import { expect, test } from "@playwright/test";
import { validateUploadType } from "../src/lib/uploadTypeValidation";

test.describe("upload type validation", () => {
  test("rejects invalid/path-traversal filenames", () => {
    const out = validateUploadType({
      filename: "../secret.pdf",
      declaredMime: "application/pdf",
    });
    expect(out.ok).toBeFalsy();
    if (!out.ok) expect(out.error).toBe("BAD_FILENAME");
  });

  test("blocks executable extensions", () => {
    const out = validateUploadType({
      filename: "malware.exe",
      declaredMime: "application/octet-stream",
    });
    expect(out.ok).toBeFalsy();
    if (!out.ok) expect(out.error).toBe("EXECUTABLE_BLOCKED");
  });

  test("blocks executable MIME prefixes even for allowed extension", () => {
    const out = validateUploadType({
      filename: "report.pdf",
      declaredMime: "application/x-msdownload",
    });
    expect(out.ok).toBeFalsy();
    if (!out.ok) expect(out.error).toBe("EXECUTABLE_BLOCKED");
  });

  test("rejects extension and declared MIME mismatch", () => {
    const out = validateUploadType({
      filename: "notes.txt",
      declaredMime: "application/pdf",
    });
    expect(out.ok).toBeFalsy();
    if (!out.ok) expect(out.error).toBe("MIME_MISMATCH");
  });

  test("rejects executable binary signature in bytes", () => {
    const out = validateUploadType({
      filename: "document.pdf",
      declaredMime: "application/pdf",
      bytes: Buffer.from([0x4d, 0x5a, 0x90, 0x00]), // MZ
    });
    expect(out.ok).toBeFalsy();
    if (!out.ok) expect(out.error).toBe("EXECUTABLE_BLOCKED");
  });

  test("rejects unknown binary signature for non-text formats", () => {
    const out = validateUploadType({
      filename: "document.pdf",
      declaredMime: "application/pdf",
      bytes: Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]),
    });
    expect(out.ok).toBeFalsy();
    if (!out.ok) expect(out.error).toBe("MIME_MISMATCH");
  });

  test("rejects invalid text file payload", () => {
    const out = validateUploadType({
      filename: "notes.txt",
      declaredMime: "text/plain",
      bytes: Buffer.from([0x00, 0xff, 0x00, 0xff]),
    });
    expect(out.ok).toBeFalsy();
    if (!out.ok) expect(out.error).toBe("MIME_MISMATCH");
  });

  test("accepts valid PDF signature", () => {
    const out = validateUploadType({
      filename: "report.pdf",
      declaredMime: "application/pdf",
      bytes: Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"),
    });
    expect(out.ok).toBeTruthy();
    if (out.ok) {
      expect(out.ext).toBe("pdf");
      expect(out.canonicalMime).toBe("application/pdf");
      expect(out.family).toBe("document");
    }
  });

  test("accepts OOXML docx files with ZIP signature", () => {
    const out = validateUploadType({
      filename: "contract.docx",
      declaredMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]), // PKZIP header
    });
    expect(out.ok).toBeTruthy();
    if (out.ok) {
      expect(out.ext).toBe("docx");
      expect(out.family).toBe("document");
    }
  });
});
