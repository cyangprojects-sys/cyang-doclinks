import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mfaEnforcementEnabled, roleRequiresMfa } from "../src/lib/mfa";

test.describe("mfa guardrails", () => {
  test("enforcement toggle applies only to privileged roles", () => {
    const old = process.env.MFA_ENFORCE_ADMIN;
    Reflect.set(process.env, "MFA_ENFORCE_ADMIN", "1");
    try {
      expect(mfaEnforcementEnabled()).toBeTruthy();
      expect(roleRequiresMfa("owner")).toBeTruthy();
      expect(roleRequiresMfa("admin")).toBeTruthy();
      expect(roleRequiresMfa("viewer")).toBeFalsy();
    } finally {
      if (typeof old === "string") Reflect.set(process.env, "MFA_ENFORCE_ADMIN", old);
      else Reflect.deleteProperty(process.env, "MFA_ENFORCE_ADMIN");
    }
  });

  test("authz enforces MFA gate for requireUser", () => {
    const code = readFileSync("src/lib/authz.ts", "utf8");
    expect(code.includes("MFA_REQUIRED")).toBeTruthy();
    expect(code.includes("roleRequiresMfa")).toBeTruthy();
  });

  test("mfa route and SQL migration are present", () => {
    const pageCode = readFileSync("src/app/mfa/page.tsx", "utf8");
    expect(pageCode.includes("Multi-factor authentication")).toBeTruthy();
    expect(pageCode.includes("Regenerate recovery codes")).toBeTruthy();
    expect(pageCode.includes("sanitizeInternalRedirectPath")).toBeTruthy();
    expect(pageCode.includes('startsWith("/") ? nextRaw : "/admin/dashboard"')).toBeFalsy();
    const actionCode = readFileSync("src/app/mfa/actions.ts", "utf8");
    expect(actionCode.includes("sanitizeInternalRedirectPath")).toBeTruthy();
    expect(actionCode.includes('next.startsWith("/") ? next : "/admin/dashboard"')).toBeFalsy();
    const sql = readFileSync("scripts/sql/mfa.sql", "utf8");
    expect(sql.includes("create table if not exists public.user_mfa")).toBeTruthy();
    expect(sql.includes("recovery_code_hashes")).toBeTruthy();
  });
});
