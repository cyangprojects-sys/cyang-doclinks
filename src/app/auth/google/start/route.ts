// src/lib/oauth-google.ts
import * as client from "openid-client";

// ---- ENV (trimmed + validated) ----
const APP_URL = (process.env.APP_URL || "").trim();
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || "").trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || "").trim();

if (!APP_URL) throw new Error("Missing APP_URL");
if (!GOOGLE_CLIENT_ID) throw new Error("Missing GOOGLE_CLIENT_ID");
if (!GOOGLE_CLIENT_SECRET) throw new Error("Missing GOOGLE_CLIENT_SECRET");

// Guard against common misconfig that breaks redirect_uri
if (APP_URL.includes("APP_URL=")) {
  throw new Error(`APP_URL is malformed (contains 'APP_URL='). Value: ${APP_URL}`);
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
    _configPromise = client.discovery(GOOGLE_ISSUER, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  }
  return _configPromise;
}

/**
 * Where Google redirects back to your app after login.
 * Update this path if your callback route differs.
 */
export function googleRedirectUri(): string {
  return `${APP_URL}/auth/google/callback`;
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
export async function createGoogleAuthRequest(_alias: string): Promise<GoogleAuthRequest> {
  const config = await getGoogleConfig();

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

  const state = client.randomState();
  const nonce = client.randomNonce();

  // IMPORTANT: add prompt + response_mode to avoid the "SetSID hang / 400" behavior
  // in some browsers/privacy settings, and to make the flow more deterministic.
  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: googleRedirectUri(),
    scope: "openid email profile",
    response_type: "code",

    // Stabilizers
    response_mode: "query",
    prompt: "select_account",

    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
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

  const tokens = await client.authorizationCodeGrant(config, req, {
    pkceCodeVerifier: checks.codeVerifier,
    expectedState: checks.state,
    expectedNonce: checks.nonce,
  });

  const claims = tokens.claims();
  return { tokens, claims };
}
