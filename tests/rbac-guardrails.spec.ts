import { expect, test } from "@playwright/test";
import {
  listRolePermissionOverrides,
  requirePermission,
  upsertRolePermissionOverride,
  userHasPermission,
  type Permission,
} from "../src/lib/rbac";
import { type AuthedUser } from "../src/lib/authz";

const ENV_DATABASE_URL = process.env.DATABASE_URL;

test.afterEach(() => {
  if (typeof ENV_DATABASE_URL === "undefined") delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ENV_DATABASE_URL;
});

test.describe("rbac guardrails", () => {
  test("fails closed on invalid runtime role/permission values", async () => {
    delete process.env.DATABASE_URL;
    const adminUser = { id: "u1", email: "a@b.com", role: "admin", orgId: null, orgSlug: null } as AuthedUser;
    const badRoleUser = { ...adminUser, role: "superadmin" } as unknown as AuthedUser;

    await expect(userHasPermission(adminUser, "not.real" as Permission)).resolves.toBeFalsy();
    await expect(userHasPermission(badRoleUser, "audit.export")).resolves.toBeFalsy();
    await expect(requirePermission("not.real" as Permission)).rejects.toThrow(/FORBIDDEN/);
  });

  test("validates upsert payload and returns empty list when table unavailable", async () => {
    delete process.env.DATABASE_URL;

    await expect(
      upsertRolePermissionOverride({
        permission: "invalid.permission" as Permission,
        role: "owner",
        allowed: true,
      })
    ).rejects.toThrow(/INVALID_RBAC_OVERRIDE/);

    await expect(
      upsertRolePermissionOverride({
        permission: "security.keys.manage",
        role: "root" as unknown as AuthedUser["role"],
        allowed: true,
      })
    ).rejects.toThrow(/INVALID_RBAC_OVERRIDE/);

    await expect(
      upsertRolePermissionOverride({
        permission: "security.keys.manage",
        role: "owner",
        allowed: "true" as unknown as boolean,
      })
    ).rejects.toThrow(/INVALID_RBAC_OVERRIDE/);

    await expect(listRolePermissionOverrides()).resolves.toEqual([]);
  });
});
