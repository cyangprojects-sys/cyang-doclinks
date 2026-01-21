import { Issuer } from "openid-client";

if (!process.env.APP_URL) throw new Error("Missing APP_URL");
if (!process.env.GOOGLE_CLIENT_ID) throw new Error("Missing GOOGLE_CLIENT_ID");
if (!process.env.GOOGLE_CLIENT_SECRET) throw new Error("Missing GOOGLE_CLIENT_SECRET");

export const REDIRECT_URI = `${process.env.APP_URL}/auth/google/callback`;

let cachedClient: any = null;

export async function getGoogleClient() {
  if (cachedClient) return cachedClient;

  const google = await Issuer.discover("https://accounts.google.com");
  const client = new google.Client({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uris: [REDIRECT_URI],
    response_types: ["code"],
  });

  cachedClient = client;
  return client;
}
