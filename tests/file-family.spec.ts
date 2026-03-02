import { expect, test } from "@playwright/test";
import { detectFileFamily, fileFamilyLabel, isMicrosoftOfficeDocument } from "../src/lib/fileFamily";

test.describe("file family classifier", () => {
  test("detects archive family from extension and MIME", () => {
    expect(detectFileFamily({ filename: "bundle.zip", contentType: "application/octet-stream" })).toBe("archive");
    expect(detectFileFamily({ contentType: "application/x-rar-compressed" })).toBe("archive");
  });

  test("detects office family for ODF and Microsoft office formats", () => {
    expect(
      detectFileFamily({
        contentType: "application/vnd.oasis.opendocument.text",
        filename: "doc.odt",
      })
    ).toBe("office");
    expect(
      detectFileFamily({
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename: "contract.docx",
      })
    ).toBe("office");
  });

  test("detects media families", () => {
    expect(detectFileFamily({ contentType: "image/png" })).toBe("image");
    expect(detectFileFamily({ contentType: "video/mp4" })).toBe("video");
    expect(detectFileFamily({ contentType: "audio/mpeg" })).toBe("audio");
  });

  test("falls back to generic file for unknown type", () => {
    expect(detectFileFamily({ contentType: "application/octet-stream", filename: "blob.bin" })).toBe("file");
  });

  test("detects Microsoft Office docs specifically", () => {
    expect(
      isMicrosoftOfficeDocument({
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
    ).toBeTruthy();
    expect(isMicrosoftOfficeDocument({ filename: "slides.pptx" })).toBeTruthy();
    expect(isMicrosoftOfficeDocument({ contentType: "application/vnd.oasis.opendocument.text", filename: "doc.odt" })).toBeFalsy();
  });

  test("maps display labels", () => {
    expect(fileFamilyLabel("pdf")).toBe("PDF");
    expect(fileFamilyLabel("office")).toBe("OFFICE");
    expect(fileFamilyLabel("archive")).toBe("ARCHIVE");
    expect(fileFamilyLabel("file")).toBe("FILE");
  });
});
