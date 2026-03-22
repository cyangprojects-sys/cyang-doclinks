import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import {
  INTENTIONAL_EXTRA_ENV_GROUPS,
  flattenIntentionalExtraEnvKeys,
} from "./env-example-manifest.mjs";

const TARGET_PATHS = ["src", "scripts", "next.config.ts"];

const INCLUDED_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set([
  ".git",
  ".next",
  "node_modules",
  "dist",
  "coverage",
  "playwright-report",
  "test-results",
]);
const SKIP_FILES = new Set([".env.local", ".env.production", ".env.example"]);
const IGNORE_KEYS = new Set([
  "CI",
  "COMSPEC",
  "PLAYWRIGHT_BASE_URL",
  "SWEEP_DIAG",
  "SWEEP_ONLY_DIAG",
  "SWEEP_TEST_EMAIL",
  "SWEEP_TEST_PASSWORD",
]);

export function parseEnvExampleKeys(content) {
  const keys = new Set();
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) {
      keys.add(match[1]);
    }
  }
  return keys;
}

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const filePath = join(dir, name);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      out.push(...listFiles(filePath));
      continue;
    }
    if (SKIP_FILES.has(name)) continue;
    if (!INCLUDED_EXT.has(extname(name))) continue;
    out.push(filePath);
  }
  return out;
}

function addKey(keys, value) {
  if (typeof value === "string" && /^[A-Z][A-Z0-9_]*$/.test(value) && !IGNORE_KEYS.has(value)) {
    keys.add(value);
  }
}

function addQuotedItems(keys, text) {
  const items = text.match(/["']([A-Z][A-Z0-9_]*)["']/g) || [];
  for (const item of items) {
    addKey(keys, item.slice(1, -1));
  }
}

export function collectStaticEnvRefs(code) {
  const keys = new Set();
  const dot = /process\.env\.([A-Z][A-Z0-9_]*)(?![A-Za-z0-9_])/g;
  let match;
  while ((match = dot.exec(code)) !== null) {
    addKey(keys, match[1]);
  }

  const bracket = /process\.env\[(["'])([A-Z][A-Z0-9_]*)\1\]/g;
  while ((match = bracket.exec(code)) !== null) {
    addKey(keys, match[2]);
  }

  const scopedEnv = /\benv\.([A-Z][A-Z0-9_]*)\b/g;
  while ((match = scopedEnv.exec(code)) !== null) {
    addKey(keys, match[1]);
  }

  const helperSingle =
    /\b(?:readEnvText|readEnvBoolean|readEnvInt|readPreferredEnvText|readPreferredEnvEmail|getHashingSalt|getRouteTimeoutMs|parseBooleanEnv|truthyEnv|mustEnv|requireEnv|require)\(\s*(["'])([A-Z][A-Z0-9_]*)\1/g;
  while ((match = helperSingle.exec(code)) !== null) {
    addKey(keys, match[2]);
  }

  const helperPreferred =
    /\b(?:readPreferredEnvText|readPreferredEnvEmail)\(\s*(["'])([A-Z][A-Z0-9_]*)\1\s*,\s*\[([^\]]*)\]/g;
  while ((match = helperPreferred.exec(code)) !== null) {
    addKey(keys, match[2]);
    addQuotedItems(keys, match[3]);
  }

  const helperArrays =
    /\b(?:readPreferredEnvBoolean|readAnyEnvText)\(\s*\[([^\]]*)\]/g;
  while ((match = helperArrays.exec(code)) !== null) {
    addQuotedItems(keys, match[1]);
  }

  return keys;
}

export function collectTargetFiles(root) {
  const files = [];
  for (const rel of TARGET_PATHS) {
    const absolute = join(root, rel);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      files.push(...listFiles(absolute));
      continue;
    }
    if (stat.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}

export function analyzeEnvExample(root = process.cwd()) {
  const envExamplePath = join(root, ".env.example");
  const envExample = readFileSync(envExamplePath, "utf8");
  const exampleKeys = parseEnvExampleKeys(envExample);
  const intentionalExtras = flattenIntentionalExtraEnvKeys();

  const sourceFiles = collectTargetFiles(root);
  const usedKeys = new Set();
  for (const file of sourceFiles) {
    const code = readFileSync(file, "utf8");
    for (const key of collectStaticEnvRefs(code)) {
      usedKeys.add(key);
    }
  }

  const missing = [...usedKeys].filter((key) => !exampleKeys.has(key)).sort();
  const extra = [...exampleKeys].filter((key) => !usedKeys.has(key)).sort();
  const intentionalExtra = extra.filter((key) => intentionalExtras.has(key));
  const unexpectedExtra = extra.filter((key) => !intentionalExtras.has(key));
  const staleAllowlist = [...intentionalExtras]
    .filter((key) => exampleKeys.has(key) && usedKeys.has(key))
    .sort();

  return {
    exampleKeys,
    usedKeys,
    missing,
    extra,
    intentionalExtra,
    unexpectedExtra,
    staleAllowlist,
    intentionalExtraGroups: INTENTIONAL_EXTRA_ENV_GROUPS,
  };
}
