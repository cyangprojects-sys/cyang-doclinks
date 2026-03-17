import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("admin layout guardrails", () => {
  test("/admin layout enforces authenticated session", () => {
    const code = readFileSync("src/app/admin/layout.tsx", "utf8");
    expect(code.includes("getServerSession")).toBeTruthy();
    expect(code.includes("if (!session?.user) redirect(\"/signin\")")).toBeTruthy();
    expect(code.includes("isAdminRole")).toBeTruthy();
    expect(code.includes("if (!isAdminRole(user.role)) redirect(\"/viewer\")")).toBeTruthy();
  });

  test("/admin/(owner) layout enforces owner role", () => {
    const code = readFileSync("src/app/admin/(owner)/layout.tsx", "utf8");
    expect(code.includes("getServerSession")).toBeTruthy();
    expect(code.includes("if (!session?.user) redirect(\"/signin\")")).toBeTruthy();
    expect(code.includes("if (user.role !== \"owner\") redirect(\"/admin\")")).toBeTruthy();
  });
});
