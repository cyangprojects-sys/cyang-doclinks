type StripeRequestOptions = {
  method?: "GET" | "POST";
  body?: Record<string, string>;
};

function mustGetStripeSecretKey(): string {
  const key = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return key;
}

function encodeFormBody(body: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    params.set(k, v);
  }
  return params.toString();
}

export async function stripeApi(path: string, opts?: StripeRequestOptions): Promise<any> {
  const key = mustGetStripeSecretKey();
  const method = opts?.method || "POST";
  const body = opts?.body || {};

  const r = await fetch(`https://api.stripe.com/v1/${path.replace(/^\/+/, "")}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "POST" ? encodeFormBody(body) : undefined,
    cache: "no-store",
  });

  const text = await r.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!r.ok) {
    const msg = String(json?.error?.message || text || `Stripe API ${path} failed`);
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

