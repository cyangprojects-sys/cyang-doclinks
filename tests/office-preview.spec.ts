import { expect, test } from "@playwright/test";
import { convertOfficeBytes } from "../src/lib/officePreview";

test.describe("office preview conversion", () => {
  test("rejects unsupported mime types", async () => {
    const out = await convertOfficeBytes({
      bytes: Buffer.from("hello", "utf8"),
      mimeType: "application/octet-stream",
    });
    expect(out.ok).toBeFalsy();
    if (!out.ok) expect(out.error).toBe("UNSUPPORTED_MIME");
  });

  test("escapes CSV cells and wraps result in shell html", async () => {
    const csv = [
      "name,notes",
      "\"alice\",\"<script>alert(1)</script>\"",
      "\"bob\",\"<img src=x onerror=alert(2)>\"",
    ].join("\n");

    const out = await convertOfficeBytes({
      bytes: Buffer.from(csv, "utf8"),
      mimeType: "text/csv",
    });
    expect(out.ok).toBeTruthy();
    if (out.ok) {
      expect(out.html).toContain("<!doctype html>");
      expect(out.html).toContain("<h2>Sheet 1</h2>");
      expect(out.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
      expect(out.html).toContain("&lt;img src=x onerror=alert(2)&gt;");
      expect(out.html).not.toContain("<script>alert(1)</script>");
      expect(out.html).not.toContain("<img src=x onerror=alert(2)>");
    }
  });

  test("limits CSV render size by row/column budget", async () => {
    const header = Array.from({ length: 40 }, (_, i) => `h${i}`).join(",");
    const row = Array.from({ length: 40 }, (_, i) => `v${i}`).join(",");
    const csv = [header, ...Array.from({ length: 1200 }, () => row)].join("\n");

    const out = await convertOfficeBytes({
      bytes: Buffer.from(csv, "utf8"),
      mimeType: "text/csv",
    });
    expect(out.ok).toBeTruthy();
    if (out.ok) {
      // 1000 rows max (including header) and 30 cols max per row.
      expect((out.html.match(/<tr>/g) || []).length).toBe(1000);
      expect((out.html.match(/<td>/g) || []).length).toBe(1000 * 30);
    }
  });

  test("rejects legacy xls preview explicitly", async () => {
    const out = await convertOfficeBytes({
      bytes: Buffer.from("legacy-xls", "utf8"),
      mimeType: "application/vnd.ms-excel",
    });
    expect(out.ok).toBeFalsy();
    if (!out.ok) {
      expect(out.error).toBe("XLS_PREVIEW_UNSUPPORTED");
      expect(out.message.toLowerCase()).toContain("not supported");
    }
  });

  test("fails closed on invalid xlsx payload", async () => {
    const out = await convertOfficeBytes({
      bytes: Buffer.from("not-a-zip-xlsx", "utf8"),
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    expect(out.ok).toBeFalsy();
    if (!out.ok) expect(out.error).toBe("SHEET_CONVERSION_FAILED");
  });
});
