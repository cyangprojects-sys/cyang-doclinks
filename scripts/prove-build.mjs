#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";

const REQUIRED_NODE = "22.16.0";
const REQUIRED_NPM = "10.9.2";

function resolveSpawn(command, args) {
  if (process.platform === "win32" && (command === "npm" || command === "npx")) {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", command, ...args],
    };
  }
  return { command, args };
}

function run(command, args) {
  console.log(`\n==> ${command} ${args.join(" ")}`);
  const resolved = resolveSpawn(command, args);
  const result = spawnSync(resolved.command, resolved.args, {
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function fail(message) {
  console.error(`Build proof preflight failed: ${message}`);
  process.exit(1);
}

function ensureBaselineVersions() {
  const nodeVersion = process.version.replace(/^v/, "");
  if (nodeVersion !== REQUIRED_NODE) {
    fail(`expected Node.js ${REQUIRED_NODE} but found ${nodeVersion}. Use the pinned proof baseline before running prove:build.`);
  }

  const npmVersionResult = spawnSync(process.platform === "win32" ? "cmd.exe" : "npm", process.platform === "win32" ? ["/d", "/s", "/c", "npm", "--version"] : ["--version"], {
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    env: process.env,
    encoding: "utf8",
  });
  if (npmVersionResult.error || npmVersionResult.status !== 0) {
    fail("npm --version could not be resolved. Install npm 10.9.2 and rerun the proof command.");
  }

  const npmVersion = String(npmVersionResult.stdout || "").trim();
  if (npmVersion !== REQUIRED_NPM) {
    fail(`expected npm ${REQUIRED_NPM} but found ${npmVersion}. Use the pinned proof baseline before running prove:build.`);
  }
}

function ensureProofEnv() {
  if (existsSync(".env.local")) return;
  if (!existsSync(".env.example")) {
    fail("missing .env.example. The proof flow relies on the committed template to prepare .env.local.");
  }
  copyFileSync(".env.example", ".env.local");
  console.log("Prepared .env.local from .env.example for this proof run.");
}

ensureBaselineVersions();
ensureProofEnv();

const commands = [
  ["npm", ["run", "lint"]],
  ["npm", ["run", "typecheck"]],
  ["npm", ["test", "--", "--runInBand"]],
  ["npm", ["run", "build"]],
  ["npm", ["run", "audit:bundle-budgets"]],
  ["npm", ["run", "production-readiness"]],
];

for (const [command, args] of commands) {
  run(command, args);
}

console.log("\nBuild proof sequence passed.");
