import { expect, test } from "@playwright/test";
import { getTrustedClientIpFromHeaders } from "../src/lib/clientIp";
import { getClientIpFromHeaders } from "../src/lib/audit";
import { getClientIp } from "../src/lib/view";
import { clientIpKey } from "../src/lib/securityTelemetry";

type EnvSnap = Record<string, string | undefined>;
const mutableEnv = process.env as Record<string, string | undefined>;

const SNAP_KEYS = ["NODE_ENV", "TRUST_PROXY_HEADERS", "TRUST_PLATFORM_PROXY_HEADERS", "VERCEL", "CF_PAGES"] as const;

function snapshotEnv(): EnvSnap {
  const out: EnvSnap = {};
  for (const k of SNAP_KEYS) out[k] = mutableEnv[k];
  return out;
}

function restoreEnv(snap: EnvSnap) {
  for (const k of SNAP_KEYS) {
    const v = snap[k];
    if (typeof v === "string") mutableEnv[k] = v;
    else Reflect.deleteProperty(mutableEnv, k);
  }
}

test.describe("client ip trust model", () => {
  const snap = snapshotEnv();

  test.afterEach(() => {
    restoreEnv(snap);
  });

  test("uses platform headers before generic proxy headers", () => {
    mutableEnv.NODE_ENV = "test";
    const headers = new Headers({
      "x-vercel-forwarded-for": "8.8.8.8, 4.4.4.4",
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
      "x-real-ip": "7.7.7.7",
    });

    expect(getTrustedClientIpFromHeaders(headers)).toBe("8.8.8.8");
    expect(getClientIpFromHeaders(headers)).toBe("8.8.8.8");
    expect(getClientIp(new Request("http://localhost", { headers }))).toBe("8.8.8.8");
  });

  test("ignores forwarded headers in production unless explicitly trusted", () => {
    mutableEnv.NODE_ENV = "production";
    Reflect.deleteProperty(mutableEnv, "TRUST_PROXY_HEADERS");
    Reflect.deleteProperty(mutableEnv, "TRUST_PLATFORM_PROXY_HEADERS");
    Reflect.deleteProperty(mutableEnv, "VERCEL");
    Reflect.deleteProperty(mutableEnv, "CF_PAGES");

    const headers = new Headers({
      "x-forwarded-for": "1.2.3.4",
      "x-real-ip": "2.2.2.2",
      "x-vercel-forwarded-for": "8.8.8.8",
    });
    expect(getTrustedClientIpFromHeaders(headers)).toBeNull();
    const telemetry = clientIpKey(new Request("http://localhost", { headers }));
    expect(telemetry.ip).toBe("0.0.0.0");
  });

  test("respects TRUST_PROXY_HEADERS for generic forwarded headers in production", () => {
    mutableEnv.NODE_ENV = "production";
    mutableEnv.TRUST_PROXY_HEADERS = "1";
    Reflect.deleteProperty(mutableEnv, "VERCEL");
    const headers = new Headers({
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
      "x-real-ip": "2.2.2.2",
    });
    expect(getTrustedClientIpFromHeaders(headers)).toBe("1.2.3.4");
  });

  test("treats managed platform env as trusted platform proxy in production", () => {
    mutableEnv.NODE_ENV = "production";
    mutableEnv.VERCEL = "1";
    Reflect.deleteProperty(mutableEnv, "TRUST_PROXY_HEADERS");
    const headers = new Headers({
      "x-vercel-forwarded-for": "8.8.8.8, 4.4.4.4",
      "x-forwarded-for": "1.2.3.4",
    });
    expect(getTrustedClientIpFromHeaders(headers)).toBe("8.8.8.8");
  });
});
