import { expect, test } from "@playwright/test";
import { verifyApiKeyFromRequest } from "../src/lib/apiAuth";

test.describe("api auth guard primitives", () => {
  test("rejects missing API key", async () => {
    const req = new Request("http://localhost/api/v1/docs");
    const out = await verifyApiKeyFromRequest(req);
    expect(out.ok).toBeFalsy();
    if (!out.ok) {
      expect(out.status).toBe(401);
      expect(out.error).toBe("MISSING_API_KEY");
    }
  });

  test("rejects malformed Authorization key format", async () => {
    const req = new Request("http://localhost/api/v1/docs", {
      headers: { authorization: "not-a-cyk-key" },
    });
    const out = await verifyApiKeyFromRequest(req);
    expect(out.ok).toBeFalsy();
    if (!out.ok) {
      expect(out.status).toBe(401);
      expect(out.error).toBe("INVALID_API_KEY_FORMAT");
    }
  });

  test("rejects malformed x-api-key format", async () => {
    const req = new Request("http://localhost/api/v1/docs", {
      headers: { "x-api-key": "invalid-key-value" },
    });
    const out = await verifyApiKeyFromRequest(req);
    expect(out.ok).toBeFalsy();
    if (!out.ok) {
      expect(out.status).toBe(401);
      expect(out.error).toBe("INVALID_API_KEY_FORMAT");
    }
  });

  test("x-api-key takes precedence over Authorization", async () => {
    const req = new Request("http://localhost/api/v1/docs", {
      headers: {
        authorization: "Bearer cyk_deadbeef_validformatbutunused",
        "x-api-key": "malformed-takes-precedence",
      },
    });
    const out = await verifyApiKeyFromRequest(req);
    expect(out.ok).toBeFalsy();
    if (!out.ok) {
      expect(out.status).toBe(401);
      expect(out.error).toBe("INVALID_API_KEY_FORMAT");
    }
  });
});
