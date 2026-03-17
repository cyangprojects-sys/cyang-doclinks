#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const commands = [
  ["npm", ["run", "audit:env-example"]],
  ["node", ["scripts/migrate.mjs", "verify"]],
  ["npm", ["run", "audit:admin-routes"]],
  ["npm", ["run", "audit:public-rendering"]],
  ["npm", ["run", "audit:polling"]],
  ["npm", ["run", "lint"]],
  ["npx", ["tsc", "--noEmit", "-p", "tsconfig.json"]],
  ["npm", ["run", "build"]],
  ["npm", ["run", "audit:bundle-budgets"]],
  ["npm", ["audit", "--omit=dev", "--audit-level=high"]],
  ["node", ["scripts/release-gate.mjs", "--allow-missing-env"]],
];

for (const [command, args] of commands) {
  console.log(`\n==> ${command} ${args.join(" ")}`);
  const windowsShell = process.platform === "win32";
  const result = windowsShell
    ? spawnSync(`${command} ${args.join(" ")}`, {
        stdio: "inherit",
        shell: true,
        env: process.env,
      })
    : spawnSync(command, args, {
        stdio: "inherit",
        shell: false,
        env: process.env,
      });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log("\nProduction readiness validation passed.");
