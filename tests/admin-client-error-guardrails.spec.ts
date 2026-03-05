import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("admin client error guardrails", () => {
  test("owner/admin client actions avoid surfacing raw exception messages", () => {
    const files = [
      "src/app/admin/(owner)/abuse/AbuseActionsClient.tsx",
      "src/app/admin/(owner)/api-keys/CreateApiKeyForm.tsx",
      "src/app/admin/(owner)/dmca/DmcaActionsClient.tsx",
    ];
    const leakPatterns = [
      "setErr(e instanceof Error ? e.message",
      "setMsg(e instanceof Error ? e.message",
      "setMsg(String(e))",
    ];

    for (const file of files) {
      const code = readFileSync(file, "utf8");
      for (const pattern of leakPatterns) {
        expect(code.includes(pattern)).toBeFalsy();
      }
    }
  });
});
