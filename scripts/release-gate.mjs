#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseDotenv } from "dotenv";
import { createMigrationClient, getMigrationStatus } from "./lib/migrations.mjs";

const SECRET_FIELDS = [
  "APP_SECRET",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
  "VIEW_SALT",
  "API_KEY_SALT",
  "SECURITY_TELEMETRY_HASH_KEY",
  "CRON_SECRET",
  "SHARE_COOKIE_SECRET",
  "ADMIN_COOKIE_SECRET",
  "OIDC_SECRETS_KEY",
];

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function normalize(value) {
  const raw = String(value || "");
  if (/[\r\n\0]/.test(raw)) return "";
  return raw.trim();
}

function isTruthy(value) {
  const raw = normalize(value).toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function looksLikePlaceholder(value) {
  const normalized = normalize(value).toLowerCase();
  if (!normalized) return false;
  return (
    normalized.startsWith("replace") ||
    normalized.startsWith("example") ||
    normalized.startsWith("changeme") ||
    normalized.startsWith("placeholder") ||
    normalized.startsWith("test_")
  );
}

function inferEnvironment(env) {
  const publicEnv = normalize(env.NEXT_PUBLIC_APP_ENV).toLowerCase();
  if (publicEnv === "staging" || publicEnv === "production" || publicEnv === "test") return publicEnv;
  const vercelEnv = normalize(env.VERCEL_ENV).toLowerCase();
  if (vercelEnv === "preview") return "staging";
  if (vercelEnv === "production") return "production";
  const nodeEnv = normalize(env.NODE_ENV).toLowerCase();
  if (nodeEnv === "production") return "production";
  if (nodeEnv === "test") return "test";
  return "development";
}

function validateUrl(findings, env, field, required, productionLike) {
  const value = normalize(env[field]);
  if (!value) {
    if (required) findings.push(`${field}: missing`);
    return;
  }
  if (looksLikePlaceholder(value)) {
    findings.push(`${field}: placeholder value`);
    return;
  }
  try {
    const parsed = new URL(value);
    if (productionLike && parsed.protocol !== "https:") {
      findings.push(`${field}: must use https outside development`);
    }
    if (productionLike && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname.toLowerCase())) {
      findings.push(`${field}: must not use loopback outside development`);
    }
    if (parsed.username || parsed.password) {
      findings.push(`${field}: must not embed credentials`);
    }
  } catch {
    findings.push(`${field}: invalid URL`);
  }
}

function validateSecret(findings, env, field, required) {
  const value = normalize(env[field]);
  if (!value) {
    if (required) findings.push(`${field}: missing`);
    return;
  }
  if (value.length < 24) findings.push(`${field}: too short`);
  if (looksLikePlaceholder(value)) findings.push(`${field}: placeholder value`);
}

function buildAuditFindings(env) {
  const environment = inferEnvironment(env);
  const productionLike = environment === "production" || environment === "staging";
  const findings = [];

  validateUrl(findings, env, "APP_URL", productionLike, productionLike);
  validateUrl(findings, env, "NEXT_PUBLIC_APP_URL", productionLike, productionLike);
  validateUrl(findings, env, "NEXTAUTH_URL", productionLike, productionLike);
  validateUrl(findings, env, "R2_ENDPOINT", productionLike, productionLike);
  validateUrl(findings, env, "MALWARE_SCANNER_URL", productionLike, productionLike);

  if (!normalize(env.DATABASE_URL)) {
    if (productionLike) findings.push("DATABASE_URL: missing");
  } else {
    try {
      const parsed = new URL(normalize(env.DATABASE_URL));
      if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
        findings.push("DATABASE_URL: invalid protocol");
      }
    } catch {
      findings.push("DATABASE_URL: invalid URL");
    }
  }

  for (const field of SECRET_FIELDS) {
    validateSecret(findings, env, field, productionLike);
  }
  validateSecret(findings, env, "R2_ACCESS_KEY_ID", productionLike);
  validateSecret(findings, env, "R2_SECRET_ACCESS_KEY", productionLike);

  if (!normalize(env.R2_BUCKET) && productionLike) findings.push("R2_BUCKET: missing");
  if (!normalize(env.DOC_MASTER_KEYS) && productionLike) findings.push("DOC_MASTER_KEYS: missing");
  if (!normalize(env.OWNER_EMAIL) && productionLike) findings.push("OWNER_EMAIL: missing");

  if (productionLike && !isTruthy(env.ENABLE_STRICT_ENV_VALIDATION)) {
    findings.push("ENABLE_STRICT_ENV_VALIDATION: must be enabled");
  }
  if (productionLike && (isTruthy(env.ADMIN_DEBUG_ENABLED) || isTruthy(env.ADMIN_DEBUG_ALLOW_PROD))) {
    findings.push("ADMIN_DEBUG_ENABLED/ADMIN_DEBUG_ALLOW_PROD: must be disabled");
  }
  if (productionLike && isTruthy(env.DEV_ALLOW_INSECURE_FALLBACK)) {
    findings.push("DEV_ALLOW_INSECURE_FALLBACK: must be disabled");
  }

  const stripeEnabled =
    isTruthy(env.PRO_PLAN_ENABLED) ||
    Boolean(normalize(env.STRIPE_SECRET_KEY)) ||
    Boolean(normalize(env.STRIPE_WEBHOOK_SECRET)) ||
    Boolean(normalize(env.STRIPE_PRO_PRICE_IDS));
  if (stripeEnabled) {
    validateSecret(findings, env, "STRIPE_SECRET_KEY", true);
    validateSecret(findings, env, "STRIPE_WEBHOOK_SECRET", true);
    if (!normalize(env.STRIPE_PRO_PRICE_IDS)) findings.push("STRIPE_PRO_PRICE_IDS: missing");
  }

  return { environment, findings };
}

function loadAuditEnv() {
  const envFile = argValue("--env-file");
  if (!envFile) return { ...process.env };
  const file = resolve(envFile);
  return {
    ...process.env,
    ...parseDotenv(readFileSync(file, "utf8")),
  };
}

async function checkMigrationStatus(env) {
  if (!normalize(env.DATABASE_URL)) {
    console.log("Migration status: skipped (DATABASE_URL not set).");
    return;
  }

  const sql = createMigrationClient(env);
  try {
    const status = await getMigrationStatus({ sql, env });
    if (status.drift.length) {
      throw new Error(
        `Applied migration checksum drift detected: ${status.drift.map((item) => item.version).join(", ")}`
      );
    }
    if (status.pending.length) {
      throw new Error(`Pending migrations detected: ${status.pending.map((item) => item.version).join(", ")}`);
    }
    console.log(`Migration status: current (${status.applied.length} applied).`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  const env = loadAuditEnv();
  const requireEnv = hasFlag("--require-env");
  const allowMissingEnv = hasFlag("--allow-missing-env");
  const hasRuntimeEnv = [
    normalize(env.DATABASE_URL),
    normalize(env.APP_URL),
    normalize(env.R2_BUCKET),
    normalize(env.DOC_MASTER_KEYS),
  ].some(Boolean);

  if (!hasRuntimeEnv) {
    if (requireEnv) {
      throw new Error("No runtime environment was detected. Provide deployment env vars before running the release gate.");
    }
    if (allowMissingEnv) {
      console.log("Release gate: runtime env audit skipped (no deployment env detected).");
      return;
    }
  }

  const audit = buildAuditFindings(env);
  console.log(`Release gate environment: ${audit.environment}`);
  if (audit.findings.length) {
    for (const finding of audit.findings) {
      console.error(`- ${finding}`);
    }
    throw new Error(`Release gate failed with ${audit.findings.length} configuration issue(s).`);
  }
  console.log("Release gate configuration audit: passed.");

  await checkMigrationStatus(env);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
