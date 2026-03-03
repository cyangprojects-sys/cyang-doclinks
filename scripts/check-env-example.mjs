import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const root = process.cwd();
const envExamplePath = join(root, ".env.example");
const TARGET_PATHS = ["src", "next.config.ts"];

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

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      out.push(...listFiles(p));
      continue;
    }
    if (SKIP_FILES.has(name)) continue;
    if (!INCLUDED_EXT.has(extname(name))) continue;
    out.push(p);
  }
  return out;
}

function parseEnvExampleKeys(content) {
  const keys = new Set();
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

function collectStaticEnvRefs(code) {
  const keys = new Set();
  const dot = /process\.env\.([A-Z][A-Z0-9_]*)/g;
  let m;
  while ((m = dot.exec(code)) !== null) keys.add(m[1]);

  const bracket = /process\.env\[(["'])([A-Z][A-Z0-9_]*)\1\]/g;
  while ((m = bracket.exec(code)) !== null) keys.add(m[2]);
  return keys;
}

function collectTargetFiles() {
  const out = [];
  for (const rel of TARGET_PATHS) {
    const abs = join(root, rel);
    const st = statSync(abs);
    if (st.isDirectory()) {
      out.push(...listFiles(abs));
    } else if (st.isFile()) {
      out.push(abs);
    }
  }
  return out;
}

function main() {
  const envExample = readFileSync(envExamplePath, "utf8");
  const exampleKeys = parseEnvExampleKeys(envExample);

  const sourceFiles = collectTargetFiles();
  const usedKeys = new Set();
  for (const file of sourceFiles) {
    const code = readFileSync(file, "utf8");
    for (const key of collectStaticEnvRefs(code)) usedKeys.add(key);
  }

  const missing = [...usedKeys].filter((k) => !exampleKeys.has(k)).sort();
  const extra = [...exampleKeys].filter((k) => !usedKeys.has(k)).sort();

  if (missing.length) {
    console.error("Missing keys in .env.example:");
    for (const k of missing) console.error(`  - ${k}`);
    process.exit(1);
  }

  if (extra.length) {
    console.log("Note: .env.example includes extra keys not statically referenced:");
    for (const k of extra) console.log(`  - ${k}`);
  }
  console.log(`.env.example check passed. Keys referenced: ${usedKeys.size}. Keys in template: ${exampleKeys.size}.`);
}

main();
