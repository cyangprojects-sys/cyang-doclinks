#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, rmSync } from "node:fs";
import { runCheckPlan } from "./lib/check-runner.mjs";

const REQUIRED_NODE = "22.16.0";
const REQUIRED_NPM = "10.9.2";

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
    if (process.platform === "win32" && npmVersionResult.error?.code === "EPERM") {
      fail("npm --version could not be spawned in the current Windows sandbox. Rerun prove:build outside the sandbox or grant broader process-spawn permissions.");
    }
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

function cleanProofArtifacts() {
  if (!existsSync(".next")) return;
  rmSync(".next", { recursive: true, force: true });
  console.log("Removed existing .next so prove:build runs from a clean production build.");
}

ensureBaselineVersions();
cleanProofArtifacts();
ensureProofEnv();

const commands = [
  { label: "Lint", command: "npm", args: ["run", "lint"] },
  { label: "Typecheck", command: "npm", args: ["run", "typecheck"] },
  { label: "Regression tests", command: "npm", args: ["test", "--", "--runInBand"] },
  { label: "Production build", command: "npm", args: ["run", "build"] },
  { label: "Bundle budget audit", command: "npm", args: ["run", "audit:bundle-budgets"] },
  { label: "Production readiness", command: "npm", args: ["run", "production-readiness"] },
];

runCheckPlan({
  title: "Build proof",
  steps: commands.map((step) => ({
    ...step,
    spawnFailureMessage:
      `could not spawn "${step.command} ${step.args.join(" ")}" in the current Windows sandbox. ` +
      "Rerun prove:build outside the sandbox or grant broader process-spawn permissions.",
  })),
});

console.log("\nBuild proof sequence passed.");
