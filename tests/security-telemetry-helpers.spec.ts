import { expect, test } from "@playwright/test";
import { clientIpKey, hashIp } from "../src/lib/securityTelemetry";

test.describe("security telemetry helper primitives", () => {
  test("hashIp is deterministic and non-empty", () => {
    const a = hashIp("1.2.3.4");
    const b = hashIp("1.2.3.4");
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  test("clientIpKey prefers Cloudflare header", () => {
    const req = new Request("http://localhost", {
      headers: {
        "cf-connecting-ip": "9.9.9.9",
        "x-forwarded-for": "1.2.3.4, 5.6.7.8",
      },
    });
    const out = clientIpKey(req);
    expect(out.ip).toBe("9.9.9.9");
    expect(out.ipHash).toBe(hashIp("9.9.9.9"));
  });

  test("clientIpKey falls back to first x-forwarded-for ip", () => {
    const req = new Request("http://localhost", {
      headers: {
        "x-forwarded-for": "1.2.3.4, 5.6.7.8",
      },
    });
    const out = clientIpKey(req);
    expect(out.ip).toBe("1.2.3.4");
    expect(out.ipHash).toBe(hashIp("1.2.3.4"));
  });

  test("clientIpKey falls back to x-real-ip then to 0.0.0.0", () => {
    const req1 = new Request("http://localhost", {
      headers: {
        "x-real-ip": "3.3.3.3",
      },
    });
    const out1 = clientIpKey(req1);
    expect(out1.ip).toBe("3.3.3.3");
    expect(out1.ipHash).toBe(hashIp("3.3.3.3"));

    const req2 = new Request("http://localhost");
    const out2 = clientIpKey(req2);
    expect(out2.ip).toBe("0.0.0.0");
    expect(out2.ipHash).toBe(hashIp("0.0.0.0"));
  });

  test("clientIpKey ignores generic proxy headers in production unless explicitly trusted", () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldTrust = process.env.TRUST_PROXY_HEADERS;
    Reflect.set(process.env, "NODE_ENV", "production");
    Reflect.deleteProperty(process.env, "TRUST_PROXY_HEADERS");
    try {
      const req = new Request("http://localhost", {
        headers: {
          "x-forwarded-for": "1.2.3.4",
          "x-real-ip": "2.2.2.2",
        },
      });
      const out = clientIpKey(req);
      expect(out.ip).toBe("0.0.0.0");
      expect(out.ipHash).toBe(hashIp("0.0.0.0"));
    } finally {
      if (typeof oldNodeEnv === "string") Reflect.set(process.env, "NODE_ENV", oldNodeEnv);
      else Reflect.deleteProperty(process.env, "NODE_ENV");
      if (typeof oldTrust === "string") Reflect.set(process.env, "TRUST_PROXY_HEADERS", oldTrust);
      else Reflect.deleteProperty(process.env, "TRUST_PROXY_HEADERS");
    }
  });
});
