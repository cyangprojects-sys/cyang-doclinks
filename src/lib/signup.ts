import { cookies, headers } from "next/headers";
import { sql } from "@/lib/db";
import { hmacSha256Hex, randomToken } from "@/lib/crypto";
import { hashPassword, verifyPassword } from "@/lib/password";

export const SIGNUP_TERMS_VERSION = "2026-03-01";
export const SIGNUP_CONSENT_COOKIE = "cy_signup_consent";

export type ManualSignupInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  company: string;
  jobTitle: string;
  country: string;
};

function normalizeEmail(emailRaw: string): string {
  return String(emailRaw || "").trim().toLowerCase();
}

async function signupTablesReady(): Promise<boolean> {
  try {
    const rows = (await sql`select to_regclass('public.signup_accounts')::text as reg`) as unknown as Array<{ reg: string | null }>;
    return Boolean(rows?.[0]?.reg);
  } catch {
    return false;
  }
}

async function legalAcceptancesReady(): Promise<boolean> {
  try {
    const rows = (await sql`select to_regclass('public.legal_acceptances')::text as reg`) as unknown as Array<{ reg: string | null }>;
    return Boolean(rows?.[0]?.reg);
  } catch {
    return false;
  }
}

export function validatePasswordComplexity(password: string): string | null {
  if (password.length < 12) return "Password must be at least 12 characters.";
  if (!/[a-z]/.test(password)) return "Password must include a lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter.";
  if (!/[0-9]/.test(password)) return "Password must include a number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include a symbol.";
  return null;
}

export async function setSignupConsentCookie(): Promise<void> {
  const c = await cookies();
  c.set(SIGNUP_CONSENT_COOKIE, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60,
  });
}

export async function hasSignupConsentCookie(): Promise<boolean> {
  const c = await cookies();
  return c.get(SIGNUP_CONSENT_COOKIE)?.value === "1";
}

export async function recordTermsAcceptance(emailRaw: string, source: string): Promise<void> {
  const email = normalizeEmail(emailRaw);
  if (!email) return;
  if (!(await legalAcceptancesReady())) return;

  let userAgent: string | null = null;
  try {
    userAgent = (await headers()).get("user-agent");
  } catch {
    userAgent = null;
  }

  await sql`
    insert into public.legal_acceptances (
      email,
      terms_version,
      accepted_at,
      acceptance_source,
      user_agent
    )
    values (
      ${email},
      ${SIGNUP_TERMS_VERSION},
      now(),
      ${source},
      ${userAgent}
    )
    on conflict (email, terms_version) do update
      set accepted_at = excluded.accepted_at,
          acceptance_source = excluded.acceptance_source,
          user_agent = excluded.user_agent
  `;
}

export async function createOrRefreshManualSignup(input: ManualSignupInput): Promise<{ token: string }> {
  if (!(await signupTablesReady())) {
    throw new Error("SIGNUP_TABLES_MISSING");
  }

  const email = normalizeEmail(input.email);
  const token = randomToken(32);
  const tokenHash = hmacSha256Hex(token);
  const passwordHash = hashPassword(input.password);

  await sql`
    insert into public.signup_accounts (
      email,
      first_name,
      last_name,
      company,
      job_title,
      country,
      password_hash,
      terms_version,
      terms_accepted_at,
      activation_token_hash,
      activation_expires_at,
      activated_at
    )
    values (
      ${email},
      ${input.firstName.trim()},
      ${input.lastName.trim()},
      ${input.company.trim() || null},
      ${input.jobTitle.trim() || null},
      ${input.country.trim() || null},
      ${passwordHash},
      ${SIGNUP_TERMS_VERSION},
      now(),
      ${tokenHash},
      now() + interval '24 hours',
      null
    )
    on conflict (email) do update
      set first_name = excluded.first_name,
          last_name = excluded.last_name,
          company = excluded.company,
          job_title = excluded.job_title,
          country = excluded.country,
          password_hash = excluded.password_hash,
          terms_version = excluded.terms_version,
          terms_accepted_at = excluded.terms_accepted_at,
          activation_token_hash = excluded.activation_token_hash,
          activation_expires_at = excluded.activation_expires_at,
          activated_at = null,
          updated_at = now()
  `;

  return { token };
}

export async function activateManualSignup(emailRaw: string, tokenRaw: string): Promise<{ ok: true; email: string }> {
  if (!(await signupTablesReady())) {
    throw new Error("SIGNUP_TABLES_MISSING");
  }

  const email = normalizeEmail(emailRaw);
  const tokenHash = hmacSha256Hex(String(tokenRaw || "").trim());
  if (!email || !tokenHash) throw new Error("INVALID_TOKEN");

  const rows = (await sql`
    select
      email,
      first_name,
      last_name,
      terms_version,
      activation_token_hash,
      activation_expires_at::text as activation_expires_at,
      activated_at::text as activated_at
    from public.signup_accounts
    where email = ${email}
    limit 1
  `) as unknown as Array<{
    email: string;
    first_name: string;
    last_name: string;
    terms_version: string;
    activation_token_hash: string | null;
    activation_expires_at: string | null;
    activated_at: string | null;
  }>;

  const row = rows?.[0];
  if (!row) throw new Error("INVALID_TOKEN");
  if (row.activated_at) return { ok: true, email };
  if (!row.activation_token_hash || row.activation_token_hash !== tokenHash) throw new Error("INVALID_TOKEN");
  if (!row.activation_expires_at || new Date(row.activation_expires_at).getTime() <= Date.now()) {
    throw new Error("TOKEN_EXPIRED");
  }

  await sql`
    update public.signup_accounts
    set activated_at = now(),
        activation_token_hash = null,
        activation_expires_at = null,
        updated_at = now()
    where email = ${email}
  `;

  await sql`
    insert into public.users (email, role)
    values (${email}, 'viewer')
    on conflict (email) do update
      set role = case
        when public.users.role = 'owner' then 'owner'
        when public.users.role = 'admin' then 'admin'
        else public.users.role
      end
  `;

  await recordTermsAcceptance(email, "manual_signup");
  return { ok: true, email };
}

export async function verifyManualCredentials(emailRaw: string, password: string): Promise<null | { email: string; name: string }> {
  if (!(await signupTablesReady())) return null;
  const email = normalizeEmail(emailRaw);
  if (!email || !password) return null;

  const rows = (await sql`
    select
      email,
      first_name,
      last_name,
      password_hash,
      activated_at::text as activated_at
    from public.signup_accounts
    where email = ${email}
    limit 1
  `) as unknown as Array<{
    email: string;
    first_name: string;
    last_name: string;
    password_hash: string;
    activated_at: string | null;
  }>;

  const row = rows?.[0];
  if (!row || !row.activated_at) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  return { email: row.email, name: `${row.first_name} ${row.last_name}`.trim() };
}

