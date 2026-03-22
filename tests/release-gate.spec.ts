import { expect, test } from "@playwright/test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test.describe("release gate summaries", () => {
  test("writes a truthful skipped summary when deployment env is absent", () => {
    const dir = mkdtempSync(join(tmpdir(), "cyang-release-gate-"));
    const summaryPath = join(dir, "summary.json");

    const result = spawnSync(
      process.execPath,
      ["scripts/release-gate.mjs", "--allow-missing-env", "--summary-json", summaryPath],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: "",
          APP_URL: "",
          R2_BUCKET: "",
          DOC_MASTER_KEYS: "",
        },
        encoding: "utf8",
      }
    );

    try {
      expect(result.status).toBe(0);
      const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
      expect(summary.ok).toBeTruthy();
      expect(summary.runtimeEnvAudit).toBe("skipped");
      expect(summary.migrationStatus).toBe("skipped");
      expect(summary.skipped).toContain(
        "Runtime env audit skipped because deployment env vars were not detected."
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
