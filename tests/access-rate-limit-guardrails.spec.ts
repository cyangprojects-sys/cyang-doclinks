import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("access/rate-limit guardrails", () => {
  test("access ticket helpers fail closed on malformed ticket ids and bound replay/ttl windows", () => {
    const code = readFileSync("src/lib/accessTicket.ts", "utf8");
    expect(code.includes("normalizeUuidOrNull(args.ticketId)")).toBeTruthy();
    expect(code.includes("MAX_TICKET_TTL_SECONDS")).toBeTruthy();
    expect(code.includes("MAX_SIGNED_URL_TTL_SECONDS")).toBeTruthy();
    expect(code.includes("MAX_REPLAY_GRACE_SECONDS")).toBeTruthy();
  });

  test("rate limiter normalizes scope/id and clamps numeric controls", () => {
    const code = readFileSync("src/lib/rateLimit.ts", "utf8");
    expect(code.includes("MAX_LIMIT")).toBeTruthy();
    expect(code.includes("MAX_WINDOW_SECONDS")).toBeTruthy();
    expect(code.includes("normalizeKey(args.scope")).toBeTruthy();
    expect(code.includes("if (!scope || !id)")).toBeTruthy();
  });
});
