// src/lib/oauth-google.ts
import * as client from "openid-client";

function requireEnv(name: "APP_URL" | "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET"): string {
  const value = (process.env[name] || "").trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

/**
 * Google OIDC issuer URL (issuer identifier).
 * Discovery will fetch the OIDC metadata from the well-known endpoints.
 */
const GOOGLE_ISSUER = new URL("https://accounts.google.com");

let _configPromise: Promise<client.Configuration> | null = null;

/**
 * Lazily discover + cache OIDC configuration for Google.
 */
export async function getGoogleConfig(): Promise<client.Configuration> {
  if (!_configPromise) {
    _configPromise = client.discovery(
      GOOGLE_ISSUER,
      requireEnv("GOOGLE_CLIENT_ID"),
      requireEnv("GOOGLE_CLIENT_SECRET")
    );
  }
  return _configPromise;
}

/**
 * Where Google redirects back to your app after login.
 * Update this path if your callback route differs.
 */
export function googleRedirectUri(): string {
  return `${requireEnv("APP_URL")}/auth/google/callback`;
}

export type GoogleAuthRequest = {
  authorizationUrl: string;
  codeVerifier: string;
  state: string;
  nonce: string;
};

/**
 * Create an authorization request using Authorization Code + PKCE.
 * You must persist codeVerifier/state/nonce until the callback.
 */
export async function createGoogleAuthRequest(alias: string): Promise<GoogleAuthRequest> {
  const config = await getGoogleConfig();

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

  const state = client.randomState();
  const nonce = client.randomNonce();

  // Include alias in the round-trip using "state" or a separate cookie/db row.
  // Here we pass alias as an extra param; you can remove if you prefer.
  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: googleRedirectUri(),
    scope: "openid email profile",
    response_type: "code",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
    // Optional: keep this if your routes expect it
    // (Google will round-trip unknown params back to redirect_uri in some cases,
    // but do not rely on it universally; best to store alias server-side.)
    // alias,
  });

  return {
    authorizationUrl: url.toString(),
    codeVerifier,
    state,
    nonce,
  };
}

export type GoogleCallbackChecks = {
  codeVerifier: string;
  state: string;
  nonce: string;
};

/**
 * Exchange the authorization code for tokens and validate state/nonce/PKCE.
 * Pass the original Request from your callback route.
 */
export async function exchangeGoogleCode(
  req: Request,
  checks: GoogleCallbackChecks
): Promise<{
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers;
  claims: client.IDToken | undefined;
}> {
  const config = await getGoogleConfig();

  const tokens = await client.authorizationCodeGrant(
    config,
    req,
    {
      pkceCodeVerifier: checks.codeVerifier,
      expectedState: checks.state,
      expectedNonce: checks.nonce,
    }
  );

  // Helper parses/validates ID Token and returns its claims
  const claims = tokens.claims();

  return { tokens, claims };
}
