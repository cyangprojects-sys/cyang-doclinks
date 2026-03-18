#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";

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

function hasUsableProductionBuild() {
  return [
    ".next/BUILD_ID",
    ".next/build-manifest.json",
    ".next/server/app-paths-manifest.json",
    ".next/server/pages-manifest.json",
  ].every((file) => existsSync(file));
}

function failSpawn(error, command, args) {
  if (process.platform === "win32" && error && typeof error === "object" && "code" in error && error.code === "EPERM") {
    console.error(
      `Unable to spawn "${command} ${args.join(" ")}" on Windows in the current sandboxed environment. ` +
        "Rerun the command outside the sandbox or grant broader process-spawn permissions."
    );
    process.exit(1);
  }
  throw error;
}

function run(command, args) {
  const resolved = resolveSpawn(command, args);
  const result = spawnSync(resolved.command, resolved.args, {
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  if (result.error) failSpawn(result.error, command, args);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!existsSync(".env.local") && existsSync(".env.example")) {
  copyFileSync(".env.example", ".env.local");
  console.log("Prepared .env.local from .env.example for the test run.");
}

if (!hasUsableProductionBuild()) {
  console.log("No reusable production build detected. Running `npm run build` before Playwright.");
  run("npm", ["run", "build"]);
}

run("npx", [
  "start-server-and-test",
  "npm run start",
  "http://127.0.0.1:3000",
  playwrightCommand,
]);
