#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function resolveSpawn(command, args) {
  if (process.platform === "win32" && (command === "npm" || command === "npx")) {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", command, ...args],
    };
  }
  return { command, args };
}

const commands = [
  ["npm", ["run", "audit:env-example"]],
  ["node", ["scripts/migrate.mjs", "verify"]],
  ["npm", ["run", "audit:admin-routes"]],
  ["npm", ["run", "audit:admin-polling"]],
  ["npm", ["run", "audit:public-rendering"]],
  ["npm", ["run", "audit:route-rendering"]],
  ["npm", ["run", "audit:polling"]],
  ["npm", ["run", "lint"]],
  ["npm", ["run", "typecheck"]],
  ["npm", ["run", "build"]],
  ["npm", ["run", "audit:bundle-budgets"]],
  ["npm", ["audit", "--omit=dev", "--audit-level=high"]],
  ["node", ["scripts/release-gate.mjs", "--allow-missing-env"]],
];

for (const [command, args] of commands) {
  console.log(`\n==> ${command} ${args.join(" ")}`);
  const resolved = resolveSpawn(command, args);
  const result = spawnSync(resolved.command, resolved.args, {
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log("\nProduction readiness validation passed.");
