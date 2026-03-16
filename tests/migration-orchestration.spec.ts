import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

test.describe("migration orchestration", () => {
  test("ordered migration wrappers exist and point at concrete SQL sources", () => {
    const dir = "db/migrations";
    const files = readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b, "en"));

    expect(files.length).toBeGreaterThan(20);
    expect(files[0]).toBe("0001__user_ownership_layer.sql");

    const seenSources = new Set<string>();
    for (const file of files) {
      expect(/^\d{4}__[a-z0-9_]+\.sql$/.test(file)).toBeTruthy();
      const wrapper = readFileSync(join(dir, file), "utf8");
      const sourceMatch = wrapper.match(/^--\s*source:\s*(.+)$/m);
      expect(sourceMatch).toBeTruthy();
      const source = String(sourceMatch?.[1] || "").trim();
      expect(existsSync(source)).toBeTruthy();
      expect(seenSources.has(source)).toBeFalsy();
      seenSources.add(source);
    }
  });

  test("user ownership baseline migration requires OWNER_EMAIL at apply time", () => {
    const wrapper = readFileSync("db/migrations/0001__user_ownership_layer.sql", "utf8");
    expect(wrapper.includes("-- requires-env: OWNER_EMAIL")).toBeTruthy();
    const source = readFileSync("scripts/sql/user_ownership_layer.sql", "utf8");
    expect(source.includes("__OWNER_EMAIL__")).toBeTruthy();
  });

  test("migration runner creates a schema_migrations ledger and supports verification/apply commands", () => {
    const command = readFileSync("scripts/migrate.mjs", "utf8");
    const library = readFileSync("scripts/lib/migrations.mjs", "utf8");
    expect(library.includes("schema_migrations")).toBeTruthy();
    expect(command.includes("verify")).toBeTruthy();
    expect(command.includes("plan")).toBeTruthy();
    expect(command.includes("status")).toBeTruthy();
    expect(command.includes("apply")).toBeTruthy();
    expect(library.includes("pg_advisory_xact_lock")).toBeTruthy();
  });
});
