type StripeRequestOptions = {
  method?: "GET" | "POST";
  body?: Record<string, string>;
};

const STRIPE_API_PATH_RE = /^[A-Za-z0-9._/-]{1,256}$/;
const STRIPE_FORM_KEY_MAX_LEN = 128;
const STRIPE_FORM_VALUE_MAX_LEN = 4000;
const STRIPE_FORM_MAX_FIELDS = 100;

function isAllowedStripeHost(hostname: string): boolean {
  const h = String(hostname || "").trim().toLowerCase();
  return h === "stripe.com" || h.endsWith(".stripe.com");
}

export function safeStripeRedirectUrl(raw: string): string {
  const v = String(raw || "").trim();
  if (!v) throw new Error("Stripe redirect URL is missing");

  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    throw new Error("Stripe redirect URL is invalid");
  }

  if (parsed.protocol !== "https:" || !isAllowedStripeHost(parsed.hostname)) {
    throw new Error("Stripe redirect URL host is not allowed");
  }

  return parsed.toString();
}

function mustGetStripeSecretKey(): string {
  const key = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return key;
}

function encodeFormBody(body: Record<string, string>): string {
  const params = new URLSearchParams();
  let count = 0;
  for (const [k, v] of Object.entries(body)) {
    const key = String(k || "").trim();
    if (!key) continue;
    if (key.length > STRIPE_FORM_KEY_MAX_LEN) {
      throw new Error("Stripe form parameter key is too long");
    }
    const value = String(v ?? "");
    if (value.length > STRIPE_FORM_VALUE_MAX_LEN) {
      throw new Error("Stripe form parameter value is too long");
    }
    params.set(key, value);
    count += 1;
    if (count > STRIPE_FORM_MAX_FIELDS) {
      throw new Error("Too many Stripe form parameters");
    }
  }
  return params.toString();
}

function normalizeStripeApiPath(path: string): string {
  const normalized = String(path || "").trim().replace(/^\/+/, "");
  if (!normalized || !STRIPE_API_PATH_RE.test(normalized) || normalized.includes("..")) {
    throw new Error("Invalid Stripe API path");
  }
  return normalized;
}

export async function stripeApi(path: string, opts?: StripeRequestOptions): Promise<Record<string, unknown>> {
  const key = mustGetStripeSecretKey();
  const normalizedPath = normalizeStripeApiPath(path);
  const method = opts?.method || "POST";
  const body = opts?.body || {};

  const r = await fetch(`https://api.stripe.com/v1/${normalizedPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "POST" ? encodeFormBody(body) : undefined,
    cache: "no-store",
  });

  const text = await r.text();
  let json: Record<string, unknown> = {};
  try {
    const parsed = text ? (JSON.parse(text) as unknown) : null;
    json = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    json = {};
  }

  if (!r.ok) {
    const errorObj = (json.error && typeof json.error === "object" ? json.error : {}) as Record<string, unknown>;
    const rawMsg = String(errorObj.message || text || "").trim();
    const msg = rawMsg ? rawMsg.slice(0, 240) : `Stripe API ${normalizedPath} failed`;
    throw new Error(msg);
  }

  return json;
}

export async function ensureStripeCustomer(args: {
  userId: string;
  email: string;
  existingCustomerId: string | null;
}): Promise<string> {
  const existing = String(args.existingCustomerId || "").trim();
  if (existing) return existing;

  const created = await stripeApi("customers", {
    method: "POST",
    body: {
      email: args.email,
      "metadata[user_id]": args.userId,
    },
  });

  const customerId = String(created?.id || "").trim();
  if (!customerId) throw new Error("Stripe customer creation returned no id");
  return customerId;
}
