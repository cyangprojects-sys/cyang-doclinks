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

function fmtDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)}s`;
}

export function runCheckPlan({ title, steps, env = process.env }) {
  const results = [];

  for (const step of steps) {
    const startedAt = Date.now();
    console.log(`\n==> [${step.label}] ${step.command} ${step.args.join(" ")}`);
    const resolved = resolveSpawn(step.command, step.args);
    const result = spawnSync(resolved.command, resolved.args, {
      stdio: "inherit",
      shell: false,
      env,
    });
    const durationMs = Date.now() - startedAt;

    if (result.error) {
      if (process.platform === "win32" && result.error.code === "EPERM") {
        const message =
          step.spawnFailureMessage ||
          `could not spawn "${step.command} ${step.args.join(" ")}" in the current Windows sandbox.`;
        throw new Error(message);
      }
      throw result.error;
    }

    const status = result.status ?? 1;
    results.push({
      label: step.label,
      command: `${step.command} ${step.args.join(" ")}`.trim(),
      durationMs,
      status,
    });

    if (status !== 0) {
      printCheckSummary(title, results, {
        failedStep: step.label,
        failureStatus: status,
      });
      process.exit(status);
    }
  }

  printCheckSummary(title, results);
  return results;
}

export function printCheckSummary(title, results, options = {}) {
  const totalMs = results.reduce((sum, step) => sum + step.durationMs, 0);
  const failedStep = options.failedStep || null;
  const statusLabel = failedStep ? "FAILED" : "PASSED";

  console.log(`\n${title} summary: ${statusLabel}`);
  for (const result of results) {
    const state = result.status === 0 ? "PASS" : "FAIL";
    console.log(`- ${state} ${result.label} (${fmtDuration(result.durationMs)})`);
  }
  console.log(`- Total duration: ${fmtDuration(totalMs)}`);

  if (failedStep) {
    console.log(`- First failing step: ${failedStep}`);
  }
}
