// src/app/auth/google/start/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { createGoogleAuthRequest } from "@/lib/oauth-google";

function setCookie(headers: Headers, name: string, value: string, maxAgeSeconds: number) {
  const secure = process.env.APP_URL?.startsWith("https://") ? "; Secure" : "";
  headers.append(
    "Set-Cookie",
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`
  );
}

// Note: include `ctx` with params even if unused.
// This satisfies Next's route handler type validator during `next build`.
export async function GET(req: NextRequest, _ctx: { params: Promise<Record<string, never>> }) {
  const url = new URL(req.url);
  const alias = (url.searchParams.get("alias") || "").trim();

  if (!alias) return new Response("Missing alias", { status: 400 });

  const { authorizationUrl, codeVerifier, state, nonce } = await createGoogleAuthRequest(alias);

  const headers = new Headers();
  setCookie(headers, "cy_oauth_alias", alias, 10 * 60);
  setCookie(headers, "cy_oauth_cv", codeVerifier, 10 * 60);
  setCookie(headers, "cy_oauth_state", state, 10 * 60);
  setCookie(headers, "cy_oauth_nonce", nonce, 10 * 60);

  headers.set("Location", authorizationUrl);
  return new Response(null, { status: 302, headers });
}
