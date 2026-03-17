#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function resolveCommand(command) {
  if (process.platform === "win32" && (command === "npm" || command === "npx")) {
    return `${command}.cmd`;
  }
  return command;
}

const commands = [
  ["node", ["scripts/release-gate.mjs", "--require-env"]],
  ["npm", ["run", "build"]],
  ["npm", ["run", "test:security:state:ci"]],
  ["npm", ["run", "test:security:freeze:ci"]],
  ["npm", ["run", "test:billing:webhook:ci"]],
  ["node", ["scripts/restore-verify.mjs", "--require-current-migrations"]],
];

for (const [command, args] of commands) {
  console.log(`\n==> ${command} ${args.join(" ")}`);
  const result = spawnSync(resolveCommand(command), args, {
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log("\nStaging fire-drill validation passed.");
