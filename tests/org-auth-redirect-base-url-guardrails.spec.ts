import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("org auth redirect base URL guardrails", () => {
  test("org auth start route resolves redirects from trusted app base URL", () => {
    const code = readFileSync("src/app/org/[slug]/auth/[provider]/route.ts", "utf8");
    expect(code.includes("resolvePublicAppBaseUrl(req.url)")).toBeTruthy();
    expect(code.includes("new URL(\"/login\", req.url)")).toBeFalsy();
    expect(code.includes("new URL(`/org/${encodeURIComponent(slug)}/login`, req.url)")).toBeFalsy();
    expect(
      code.includes(
        "new URL(\n      `/api/auth/signin/${encodeURIComponent(provider)}?callbackUrl=${encodeURIComponent(\"/admin/dashboard\")}`,\n      appBaseUrl\n    )"
      )
    ).toBeTruthy();
  });
});
