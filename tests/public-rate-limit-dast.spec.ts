import { expect, test } from "@playwright/test";
import { config as loadDotenv } from "dotenv";
import { NextRequest } from "next/server";
import { POST as manualSignupPost } from "../src/app/api/auth/manual-signup/route";
import { POST as signupConsentPost } from "../src/app/api/auth/signup-consent/route";

loadDotenv({ path: ".env.local", quiet: true });

function requestWithIp(url: string, ip: string, body: string): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(body)),
      "x-forwarded-for": ip,
    },
    body,
  });
}

function uniqueTestIp(seed: number): string {
  const suffix = 10 + (seed % 200);
  return `203.0.113.${suffix}`;
}

test.describe("staged DAST rate-limit audit", () => {
  test("manual signup endpoint throttles burst traffic", async () => {
    const previous = process.env.RATE_LIMIT_MANUAL_SIGNUP_IP_PER_MIN;
    process.env.RATE_LIMIT_MANUAL_SIGNUP_IP_PER_MIN = "2";
    try {
      const ip = uniqueTestIp(Date.now());
      const statuses: number[] = [];
      for (let i = 0; i < 4; i += 1) {
        const res = await manualSignupPost(
          requestWithIp("http://localhost/api/auth/manual-signup", ip, "{}")
        );
        statuses.push(res.status);
      }
      expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    } finally {
      if (previous == null) {
        delete process.env.RATE_LIMIT_MANUAL_SIGNUP_IP_PER_MIN;
      } else {
        process.env.RATE_LIMIT_MANUAL_SIGNUP_IP_PER_MIN = previous;
      }
    }
  });

  test("signup consent endpoint throttles burst traffic", async () => {
    const previous = process.env.RATE_LIMIT_SIGNUP_CONSENT_IP_PER_MIN;
    process.env.RATE_LIMIT_SIGNUP_CONSENT_IP_PER_MIN = "2";
    try {
      const ip = uniqueTestIp(Date.now() + 1000);
      const statuses: number[] = [];
      for (let i = 0; i < 4; i += 1) {
        const res = await signupConsentPost(
          requestWithIp("http://localhost/api/auth/signup-consent", ip, '{"acceptTerms":false}')
        );
        statuses.push(res.status);
      }
      expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    } finally {
      if (previous == null) {
        delete process.env.RATE_LIMIT_SIGNUP_CONSENT_IP_PER_MIN;
      } else {
        process.env.RATE_LIMIT_SIGNUP_CONSENT_IP_PER_MIN = previous;
      }
    }
  });
});

