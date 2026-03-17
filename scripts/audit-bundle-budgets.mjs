#!/usr/bin/env node

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
