import { expect, test } from "@playwright/test";
import { findMissingPublicTableColumns } from "../src/lib/dbSchema";

test.describe("db schema helper guardrails", () => {
  test("fails closed for invalid table identifiers", async () => {
    const out = await findMissingPublicTableColumns("../docs", ["id", "owner_id"]);
    expect(out).toEqual(["id", "owner_id"]);
  });

  test("normalizes and filters malformed required column names", async () => {
    const out = await findMissingPublicTableColumns("../docs", [
      "ID",
      "owner_id",
      "bad-name",
      "bad\r\nname",
      "",
      "id",
    ]);
    expect(out).toEqual(["id", "owner_id"]);
  });
});
