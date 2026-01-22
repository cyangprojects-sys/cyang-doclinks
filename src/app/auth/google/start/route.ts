export const runtime = "nodejs";

import { createGoogleAuthRequest } from "@/lib/oauth-google";

function setCookie(headers: Headers, name: string, value: string, maxAgeSeconds: number) {
  // Minimal cookie builder to avoid coupling to your cookie helpers.
  // If you have cookieHeader(), you can swap this out.
  const secure = process.env.APP_URL?.startsWith("https://") ? "; Secure" : "";
  headers.append(
    "Set-Cookie",
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const alias = (url.searchParams.get("alias") || "").trim();

  if (!alias) return new Response("Missing alias", { status: 400 });

  const { authorizationUrl, codeVerifier, state, nonce } = await createGoogleAuthRequest(alias);

  const headers = new Headers();
  // Short-lived cookies just for completing OAuth
  setCookie(headers, "cy_oauth_alias", alias, 10 * 60);
  setCookie(headers, "cy_oauth_cv", codeVerifier, 10 * 60);
  setCookie(headers, "cy_oauth_state", state, 10 * 60);
  setCookie(headers, "cy_oauth_nonce", nonce, 10 * 60);

  headers.set("Location", authorizationUrl);
  return new Response(null, { status: 302, headers });
}
