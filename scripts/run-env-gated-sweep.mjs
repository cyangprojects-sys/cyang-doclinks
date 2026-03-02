import { config as loadDotenv } from "dotenv";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { request } from "@playwright/test";
import { spawnSync } from "node:child_process";

loadDotenv({ path: ".env.local" });

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const testEmail = String(process.env.SWEEP_TEST_EMAIL || "security-sweep-bot@cyang.io").trim().toLowerCase();
const testPassword = String(process.env.SWEEP_TEST_PASSWORD || "SweepPass#2026!Secure").trim();

if (!databaseUrl) {
  console.error("Missing DATABASE_URL for env-gated sweep.");
  process.exit(1);
}

const sql = neon(databaseUrl);

async function ensureManualSigninFixture() {
  const tableRows = await sql`
    select to_regclass('public.signup_accounts')::text as reg
  `;
  const table = tableRows?.[0]?.reg || null;
  if (!table) {
    console.error("public.signup_accounts is missing; cannot generate manual auth fixture.");
    process.exit(1);
  }

  const passwordHash = bcrypt.hashSync(testPassword, 12);
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
      ${testEmail},
      'Security',
      'Sweep',
      'CYANG',
      'QA',
      'US',
      ${passwordHash},
      '2026-03-01',
      now(),
      null,
      null,
      now()
    )
    on conflict (email) do update
      set password_hash = excluded.password_hash,
          activated_at = now(),
          activation_token_hash = null,
          activation_expires_at = null,
          updated_at = now()
  `;
}

async function mintAuthCookie() {
  const ctx = await request.newContext({ baseURL });
  try {
    const csrfRes = await ctx.get("/api/auth/csrf");
    if (!csrfRes.ok()) throw new Error(`csrf_failed_${csrfRes.status()}`);
    const csrfJson = await csrfRes.json();
    const csrfToken = String(csrfJson?.csrfToken || "").trim();
    if (!csrfToken) throw new Error("csrf_token_missing");

    const signinRes = await ctx.post("/api/auth/callback/manual-password", {
      form: {
        csrfToken,
        email: testEmail,
        password: testPassword,
        callbackUrl: "/admin/dashboard",
        json: "true",
      },
    });
    if (!signinRes.ok()) throw new Error(`signin_failed_${signinRes.status()}`);

    const state = await ctx.storageState();
    const authCookies = state.cookies
      .filter((c) => c.name.includes("next-auth") || c.name.includes("csrf-token"))
      .map((c) => `${c.name}=${c.value}`);
    if (!authCookies.length) throw new Error("auth_cookie_missing");
    return authCookies.join("; ");
  } finally {
    await ctx.dispose();
  }
}

async function main() {
  await ensureManualSigninFixture();
  const authCookie = await mintAuthCookie();

  if (String(process.env.SWEEP_DIAG || "") === "1") {
    const diagCtx = await request.newContext({
      baseURL,
      extraHTTPHeaders: {
        cookie: authCookie,
      },
    });
    try {
      const sessionRes = await diagCtx.get("/api/auth/session");
      const sessionText = await sessionRes.text();
      console.log(`[diag] session status=${sessionRes.status()} body=${sessionText.slice(0, 300)}`);

      const presignRes = await diagCtx.post("/api/admin/upload/presign", {
        data: {
          filename: `diag-${Date.now()}.txt`,
          contentType: "text/plain",
          sizeBytes: 16,
          encrypt: true,
        },
      });
      const presignText = await presignRes.text();
      console.log(`[diag] presign status=${presignRes.status()} body=${presignText.slice(0, 300)}`);
    } finally {
      await diagCtx.dispose();
    }
  }
  if (String(process.env.SWEEP_ONLY_DIAG || "") === "1") {
    return;
  }

  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    ATTACK_TEST_AUTH_COOKIE: authCookie,
    STRIPE_WEBHOOK_SECRET: String(process.env.STRIPE_WEBHOOK_SECRET || "").trim(),
    RATE_LIMIT_ALIAS_IP_PER_MIN: "10000",
    RATE_LIMIT_SHARE_IP_PER_MIN: "10000",
    RATE_LIMIT_SERVE_IP_PER_MIN: "10000",
    RATE_LIMIT_TOKEN_GUESS_IP_PER_MIN: "10000",
    RATE_LIMIT_ALIAS_GUESS_IP_PER_MIN: "10000",
    RATE_LIMIT_UPLOAD_PRESIGN_IP_PER_MIN: "10000",
    RATE_LIMIT_UPLOAD_COMPLETE_IP_PER_MIN: "10000",
    ABUSE_BLOCK_TOKEN_THRESHOLD: "100000",
    ABUSE_BLOCK_SERVE_THRESHOLD: "100000",
    ABUSE_BLOCK_PRESIGN_THRESHOLD: "100000",
    ABUSE_BLOCK_STRIPE_SIG_THRESHOLD: "100000",
  };

  const files = [
    "tests/attack-sim.spec.ts",
    "tests/security-state.spec.ts",
    "tests/security-freeze.spec.ts",
    "tests/billing-webhook.spec.ts",
  ];

  const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";
  const run = spawnSync(npxBin, ["playwright", "test", "--workers=1", ...files], {
    stdio: "inherit",
    env,
  });
  process.exit(run.status ?? 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
