import crypto from "crypto";

let cachedSecret: string | null = null;

function getSecret(): string {
  if (cachedSecret) return cachedSecret;

  const secret = (process.env.APP_SECRET || "").trim();
  if (!secret) {
    throw new Error("Missing APP_SECRET");
  }

  cachedSecret = secret;
  return secret;
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hmacSha256Hex(input: string): string {
  return crypto.createHmac("sha256", getSecret()).update(input).digest("hex");
}

export function signPayload(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySignedPayload<T>(signed: string): T | null {
  const [body, sig] = signed.split(".");
  if (!body || !sig) return null;

  const expected = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  try {
    const json = Buffer.from(body, "base64url").toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
