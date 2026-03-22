import { expect, test } from "@playwright/test";
import { deriveStatusPageScenario, type StatusSnapshot } from "../src/lib/statusPageScenario";

function snapshot(overrides: Partial<StatusSnapshot>): StatusSnapshot {
  return {
    ok: false,
    service: "cyang.io",
    ts: Date.now(),
    ...overrides,
  };
}

test.describe("status page live scenario mapping", () => {
  test("shows degraded when readiness returns a degraded payload", () => {
    const scenario = deriveStatusPageScenario(snapshot({ status: "degraded" }), "live");
    expect(scenario).toBe("degraded");
  });

  test("shows partial outage when readiness is explicitly down", () => {
    const scenario = deriveStatusPageScenario(snapshot({ status: "down" }), "live");
    expect(scenario).toBe("partial_outage");
  });

  test("keeps rate-limited telemetry in degraded fallback posture", () => {
    const scenario = deriveStatusPageScenario(snapshot({ error: "RATE_LIMIT" }), "live");
    expect(scenario).toBe("snapshot_unavailable");
  });

  test("shows snapshot unavailable when live snapshot is missing", () => {
    const scenario = deriveStatusPageScenario(null, "live");
    expect(scenario).toBe("snapshot_unavailable");
  });

  test("shows snapshot unavailable when freshness timestamp is missing", () => {
    const scenario = deriveStatusPageScenario(snapshot({ ts: null, status: "ok" }), "live");
    expect(scenario).toBe("snapshot_unavailable");
  });

  test("shows snapshot unavailable when the public snapshot is stale", () => {
    const scenario = deriveStatusPageScenario(
      snapshot({ ts: Date.now() - 21 * 60 * 1000, status: "ok" }),
      "live"
    );
    expect(scenario).toBe("snapshot_unavailable");
  });
});
