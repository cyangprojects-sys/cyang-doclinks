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
