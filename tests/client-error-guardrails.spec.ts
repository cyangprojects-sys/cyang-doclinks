import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("client error guardrails", () => {
  test("client forms and viewers avoid exposing raw exception messages in production paths", () => {
    const files = [
      "src/app/d/[alias]/SharePanel.tsx",
      "src/app/d/[alias]/ShareForm.tsx",
      "src/app/admin/dashboard/UploadPanel.tsx",
      "src/app/admin/(owner)/security/KeyManagementPanel.tsx",
      "src/app/report/ReportForm.tsx",
      "src/app/signup/page.tsx",
      "src/app/components/SecurePdfCanvasViewer.tsx",
    ];
    const leakPatterns = [
      "setErr(e instanceof Error ? e.message",
      "setError(e instanceof Error ? e.message",
      "setMsg(e instanceof Error ? e.message",
    ];

    for (const file of files) {
      const code = readFileSync(file, "utf8");
      for (const pattern of leakPatterns) {
        expect(code.includes(pattern)).toBeFalsy();
      }
    }
  });
});
