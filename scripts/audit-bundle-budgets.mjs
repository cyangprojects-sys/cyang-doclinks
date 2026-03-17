#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();

const BUDGETS = [
  { label: "home", manifest: ".next/server/app/page/react-loadable-manifest.json", maxBytes: 140 * 1024 },
  { label: "pricing", manifest: ".next/server/app/pricing/page/react-loadable-manifest.json", maxBytes: 170 * 1024 },
  { label: "status", manifest: ".next/server/app/status/page/react-loadable-manifest.json", maxBytes: 220 * 1024 },
  { label: "signin", manifest: ".next/server/app/signin/page/react-loadable-manifest.json", maxBytes: 240 * 1024 },
  { label: "signup", manifest: ".next/server/app/signup/page/react-loadable-manifest.json", maxBytes: 240 * 1024 },
  { label: "admin-dashboard", manifest: ".next/server/app/admin/dashboard/page/react-loadable-manifest.json", maxBytes: 280 * 1024 },
  { label: "viewer-dashboard", manifest: ".next/server/app/viewer/page/react-loadable-manifest.json", maxBytes: 280 * 1024 },
];

function fmtKiB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function resolveSpawn(command, args) {
  if (process.platform === "win32" && (command === "npm" || command === "npx")) {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", command, ...args],
    };
  }
  return { command, args };
}

function ensureBuildArtifacts() {
  const hasMissingManifest = BUDGETS.some((budget) => !existsSync(resolve(ROOT, budget.manifest)));
  if (!hasMissingManifest) return;
  if (process.env.BUNDLE_BUDGETS_AUTO_BUILD === "0") {
    throw new Error("Missing build manifest(s) and auto-build disabled. Run npm run build first.");
  }

  console.log("Build manifests missing. Running npm run build before bundle audit...");
  const resolved = resolveSpawn("npm", ["run", "build"]);
  const result = spawnSync(resolved.command, resolved.args, {
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`npm run build failed with exit code ${result.status || 1}.`);
  }
}

function readManifestFiles(pathname) {
  const file = resolve(ROOT, pathname);
  if (!existsSync(file)) {
    throw new Error(`Missing build manifest: ${pathname}. Run npm run build first.`);
  }
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  const chunks = new Set();
  for (const value of Object.values(parsed)) {
    if (!value || typeof value !== "object") continue;
    const files = Array.isArray(value.files) ? value.files : [];
    for (const chunk of files) {
      if (typeof chunk === "string" && chunk.endsWith(".js")) {
        chunks.add(chunk);
      }
    }
  }
  return [...chunks];
}

let hasFailure = false;

ensureBuildArtifacts();

for (const budget of BUDGETS) {
  const files = readManifestFiles(budget.manifest);
  const totalBytes = files.reduce((sum, file) => {
    const absolute = resolve(ROOT, ".next", file.replace(/^static\//, "static/"));
    if (!existsSync(absolute)) return sum;
    return sum + statSync(absolute).size;
  }, 0);

  console.log(`${budget.label}: ${fmtKiB(totalBytes)} route-specific client JS`);
  if (totalBytes > budget.maxBytes) {
    hasFailure = true;
    console.error(
      `- ${budget.label} exceeds budget: ${fmtKiB(totalBytes)} > ${fmtKiB(budget.maxBytes)}`
    );
  }
}

if (hasFailure) {
  process.exit(1);
}

console.log("Bundle budget audit passed.");
