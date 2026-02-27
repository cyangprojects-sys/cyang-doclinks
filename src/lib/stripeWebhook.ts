import crypto from "crypto";

type VerifyArgs = {
  rawBody: string;
  signatureHeader: string | null;
  secret: string | null;
  toleranceSeconds?: number;
};

type VerifyResult =
  | { ok: true; payload: any; eventId: string; eventType: string }
  | { ok: false; error: string };

function parseSigHeader(header: string): { ts: number | null; v1: string[] } {
  const parts = String(header || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let ts: number | null = null;
  const v1: string[] = [];

  for (const p of parts) {
    const [k, v] = p.split("=", 2);
    if (!k || !v) continue;
    if (k === "t") {
      const n = Number(v);
      if (Number.isFinite(n)) ts = n;
    } else if (k === "v1") {
      v1.push(v);
    }
  }

  return { ts, v1 };
}

function timingSafeHexEqual(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

export function verifyStripeWebhookSignature(args: VerifyArgs): VerifyResult {
  const secret = String(args.secret || "").trim();
  if (!secret) return { ok: false, error: "MISSING_WEBHOOK_SECRET" };
  if (!args.signatureHeader) return { ok: false, error: "MISSING_SIGNATURE_HEADER" };

  const parsed = parseSigHeader(args.signatureHeader);
  if (!parsed.ts || parsed.v1.length === 0) return { ok: false, error: "INVALID_SIGNATURE_HEADER" };

  const tolerance = Number.isFinite(args.toleranceSeconds) ? Number(args.toleranceSeconds) : 300;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsed.ts) > tolerance) {
    return { ok: false, error: "SIGNATURE_TIMESTAMP_OUT_OF_TOLERANCE" };
  }

  const signedPayload = `${parsed.ts}.${args.rawBody}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
  const matched = parsed.v1.some((sig) => timingSafeHexEqual(expected, sig));
  if (!matched) return { ok: false, error: "SIGNATURE_MISMATCH" };

  let payload: any;
  try {
    payload = JSON.parse(args.rawBody);
  } catch {
    return { ok: false, error: "INVALID_JSON" };
  }

  const eventId = String(payload?.id || "").trim();
  const eventType = String(payload?.type || "").trim();
  if (!eventId || !eventType) return { ok: false, error: "MALFORMED_EVENT" };

  return { ok: true, payload, eventId, eventType };
}

