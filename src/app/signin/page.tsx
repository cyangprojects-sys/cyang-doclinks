import SignInClient from "./SignInClient";
import { isSignupEnabled } from "@/lib/signup";

export const runtime = "nodejs";

function parseIntent(value: string | string[] | undefined): "admin" | "viewer" {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "admin" ? "admin" : "viewer";
}

function parseError(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const safe = String(raw || "").trim();
  if (!safe) return null;
  if (safe.length > 80) return "Default";
  return safe;
}

export default async function SignInPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = (await props.searchParams) || {};
  const googleConfigured =
    !!String(process.env.GOOGLE_CLIENT_ID || "").trim() &&
    !!String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
  const enterpriseConfigured =
    !!String(process.env.OIDC_ISSUER || "").trim() &&
    !!String(process.env.OIDC_CLIENT_ID || "").trim() &&
    !!String(process.env.OIDC_CLIENT_SECRET || "").trim();

  const initialIntent = searchParams.intent ? parseIntent(searchParams.intent) : "viewer";

  return (
    <SignInClient
      googleConfigured={googleConfigured}
      enterpriseConfigured={enterpriseConfigured}
      signupEnabled={isSignupEnabled()}
      authError={parseError(searchParams.error)}
      initialIntent={initialIntent}
    />
  );
}
