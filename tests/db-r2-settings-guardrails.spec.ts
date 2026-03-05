import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { getR2Bucket, getR2Prefix } from "../src/lib/r2";

const ENV_SNAPSHOT = {
  R2_BUCKET: process.env.R2_BUCKET,
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
  R2_PREFIX: process.env.R2_PREFIX,
};

test.afterEach(() => {
  if (typeof ENV_SNAPSHOT.R2_BUCKET === "undefined") delete process.env.R2_BUCKET;
  else process.env.R2_BUCKET = ENV_SNAPSHOT.R2_BUCKET;
  if (typeof ENV_SNAPSHOT.R2_BUCKET_NAME === "undefined") delete process.env.R2_BUCKET_NAME;
  else process.env.R2_BUCKET_NAME = ENV_SNAPSHOT.R2_BUCKET_NAME;
  if (typeof ENV_SNAPSHOT.R2_PREFIX === "undefined") delete process.env.R2_PREFIX;
  else process.env.R2_PREFIX = ENV_SNAPSHOT.R2_PREFIX;
});

test.describe("db/r2/settings guardrails", () => {
  test("db helper validates DATABASE_URL format and protocol", () => {
    const code = readFileSync("src/lib/db.ts", "utf8");
    expect(code.includes("ALLOWED_DB_PROTOCOLS")).toBeTruthy();
    expect(code.includes("Invalid DATABASE_URL protocol")).toBeTruthy();
  });

  test("r2 helpers fail closed on dangerous prefixes and bucket names", () => {
    process.env.R2_PREFIX = "../escape";
    expect(getR2Prefix()).toBe("docs/");
    process.env.R2_PREFIX = "folder/sub";
    expect(getR2Prefix()).toBe("folder/sub/");

    process.env.R2_BUCKET = "bad/bucket";
    delete process.env.R2_BUCKET_NAME;
    expect(() => getR2Bucket()).toThrow(/Invalid R2 bucket name/);
  });

  test("settings helper maps raw failures to safe error codes", () => {
    const code = readFileSync("src/lib/settings.ts", "utf8");
    expect(code.includes("SETTINGS_TABLE_NOT_READY")).toBeTruthy();
    expect(code.includes("SETTINGS_UNAVAILABLE")).toBeTruthy();
  });
});
