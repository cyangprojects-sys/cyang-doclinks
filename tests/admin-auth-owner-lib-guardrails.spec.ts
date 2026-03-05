import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("admin/auth/owner helper guardrails", () => {
  test("admin helper normalizes role/email before authorization decisions", () => {
    const code = readFileSync("src/lib/admin.ts", "utf8");
    expect(code.includes("normalizeRoleOrNull")).toBeTruthy();
    expect(code.includes("normalizeEmailOrNull")).toBeTruthy();
    expect(code.includes("if (!role || !roleAtLeast(role, \"admin\")) throw new Error(\"Forbidden.\");")).toBeTruthy();
    expect(code.includes("if (!email) throw new Error(\"Unauthorized.\");")).toBeTruthy();
  });

  test("auth legacy helper validates normalized session email", () => {
    const code = readFileSync("src/lib/auth.ts", "utf8");
    expect(code.includes("normalizeSessionEmail")).toBeTruthy();
    expect(code.includes("if (!normalizeSessionEmail(session?.user?.email)) throw new Error(\"UNAUTHENTICATED\");")).toBeTruthy();
  });

  test("owner legacy helper validates role shape before roleAtLeast check", () => {
    const code = readFileSync("src/lib/owner.ts", "utf8");
    expect(code.includes("function normalizeRole")).toBeTruthy();
    expect(code.includes("if (!role || !roleAtLeast(role, \"admin\"))")).toBeTruthy();
  });
});
