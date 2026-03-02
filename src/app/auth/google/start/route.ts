// src/app/auth/google/start/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { createGoogleAuthRequest } from "@/lib/oauth-google";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";
import { shouldUseSecureCookies } from "@/lib/cookies";

const ALIAS_RE = /^[a-z0-9][a-z0-9_-]{1,127}$/i;

function setCookie(headers: Headers, name: string, value: string, maxAgeSeconds: number) {
  const secure = shouldUseSecureCookies() ? "; Secure" : "";
  headers.append(
    "Set-Cookie",
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`
  );
}

// Note: include `ctx` with params even if unused.
// This satisfies Next's route handler type validator during `next build`.
export async function GET(req: NextRequest, _ctx: { params: Promise<Record<string, never>> }) {
  const rl = await enforceGlobalApiRateLimit({
    req,
    scope: "ip:auth_google_start",
    limit: Number(process.env.RATE_LIMIT_AUTH_GOOGLE_START_IP_PER_MIN || 30),
    windowSeconds: 60,
  });
  if (!rl.ok) {
    return new Response("Too many requests. Please try again shortly.", {
      status: rl.status,
      headers: { "Retry-After": String(rl.retryAfterSeconds) },
    });
  }

  const url = new URL(req.url);
  const alias = (url.searchParams.get("alias") || "").trim();

  if (!alias || !ALIAS_RE.test(alias)) return new Response("Missing or invalid alias", { status: 400 });

  const { authorizationUrl, codeVerifier, state, nonce } = await createGoogleAuthRequest(alias);

  const headers = new Headers();
  setCookie(headers, "cy_oauth_alias", alias, 10 * 60);
  setCookie(headers, "cy_oauth_cv", codeVerifier, 10 * 60);
  setCookie(headers, "cy_oauth_state", state, 10 * 60);
  setCookie(headers, "cy_oauth_nonce", nonce, 10 * 60);

  headers.set("Location", authorizationUrl);
  return new Response(null, { status: 302, headers });
}
