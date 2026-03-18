#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

function resolveSpawn(command, args) {
  if (process.platform === "win32" && (command === "npm" || command === "npx")) {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", command, ...args],
    };
  }
  return { command, args };
}

function quoteArg(arg) {
  if (!/[ \t"]/u.test(arg)) return arg;
  return `"${arg.replace(/(["\\])/g, "\\$1")}"`;
}

const forwardedArgs = [];

for (const arg of process.argv.slice(2)) {
  if (arg === "--runInBand") {
    forwardedArgs.push("--workers=1");
    continue;
  }
  forwardedArgs.push(arg);
}

const playwrightCommand =
  forwardedArgs.length > 0
    ? `npm run test:playwright -- ${forwardedArgs.map(quoteArg).join(" ")}`
    : "npm run test:playwright";

function run(command, args) {
  const resolved = resolveSpawn(command, args);
  const result = spawnSync(resolved.command, resolved.args, {
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!existsSync(".next/BUILD_ID")) {
  run("npm", ["run", "build"]);
}

run("npx", [
  "start-server-and-test",
  "npm run start",
  "http://127.0.0.1:3000",
  playwrightCommand,
]);
