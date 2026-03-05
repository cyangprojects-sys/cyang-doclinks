import { expect, test } from "@playwright/test";
import { config as loadDotenv } from "dotenv";
import { NextRequest } from "next/server";
import { POST as abuseReportPost } from "../src/app/api/v1/abuse/report/route";
import { POST as takedownPost } from "../src/app/api/v1/takedown/route";
import { POST as aliasesPost } from "../src/app/api/v1/aliases/route";
import { POST as sharesPost } from "../src/app/api/v1/shares/route";
import { POST as backupStatusPost } from "../src/app/api/backup/status/route";

loadDotenv({ path: ".env.local", quiet: true });

function jsonRequest(url: string, bytes: number, headers?: Record<string, string>): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(bytes),
      "x-forwarded-for": "198.51.100.24",
      ...(headers || {}),
    },
    body: "{}",
  });
}

async function expectPayloadTooLarge(res: Response) {
  expect(res.status).toBe(413);
  const body = await res.json();
  expect(body?.error).toBe("PAYLOAD_TOO_LARGE");
}

test.describe("runtime oversized payload handling", () => {
  test("v1 abuse report rejects oversized payloads at runtime", async () => {
    const res = await abuseReportPost(jsonRequest("http://localhost/api/v1/abuse/report", 20 * 1024));
    await expectPayloadTooLarge(res);
  });

  test("v1 takedown rejects oversized payloads at runtime", async () => {
    const res = await takedownPost(jsonRequest("http://localhost/api/v1/takedown", 32 * 1024));
    await expectPayloadTooLarge(res);
  });

  test("v1 aliases rejects oversized payloads at runtime", async () => {
    const res = await aliasesPost(jsonRequest("http://localhost/api/v1/aliases", 20 * 1024));
    await expectPayloadTooLarge(res);
  });

  test("v1 shares rejects oversized payloads at runtime", async () => {
    const res = await sharesPost(jsonRequest("http://localhost/api/v1/shares", 96 * 1024));
    await expectPayloadTooLarge(res);
  });

  test("backup status rejects oversized payloads at runtime", async () => {
    const previous = process.env.BACKUP_STATUS_WEBHOOK_TOKEN;
    process.env.BACKUP_STATUS_WEBHOOK_TOKEN = "test-backup-token";
    try {
      const res = await backupStatusPost(
        jsonRequest("http://localhost/api/backup/status", 20 * 1024, {
          authorization: "Bearer test-backup-token",
        })
      );
      await expectPayloadTooLarge(res);
    } finally {
      if (previous == null) {
        delete process.env.BACKUP_STATUS_WEBHOOK_TOKEN;
      } else {
        process.env.BACKUP_STATUS_WEBHOOK_TOKEN = previous;
      }
    }
  });
});

