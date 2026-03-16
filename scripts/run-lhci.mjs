import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(".");
const LHCI_CONFIG_PATH = resolve(".lighthouserc.json");
const LHCI_CLI_PATH = resolve("node_modules", "@lhci", "cli", "src", "cli.js");
const LIGHTHOUSE_CLI_PATH = resolve("node_modules", "lighthouse", "cli", "index.js");
const SAFE_CHROME_FLAGS = [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--disable-extensions",
  "--disable-component-extensions-with-background-pages",
  "--proxy-server=direct://",
  "--proxy-bypass-list=*",
  "--no-proxy-server",
];

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

if (!existsSync(LHCI_CONFIG_PATH)) {
  fail("Missing .lighthouserc.json.");
}
if (!existsSync(LHCI_CLI_PATH)) {
  fail("Missing @lhci/cli dependency. Run `npm install` before running Lighthouse audits.");
}
if (!existsSync(LIGHTHOUSE_CLI_PATH)) {
  fail("Missing lighthouse CLI dependency. Run `npm install` before running Lighthouse audits.");
}

const chromePath = chromium.executablePath();
const runTmpDir = mkdtempSync(join(tmpdir(), "cyang-lhci-"));
const env = {
  ...process.env,
  CHROME_PATH: chromePath,
  TMP: runTmpDir,
  TEMP: runTmpDir,
  TMPDIR: runTmpDir,
};

function parseConfig() {
  const raw = readFileSync(LHCI_CONFIG_PATH, "utf8");
  const parsed = JSON.parse(raw);
  const collect = parsed?.ci?.collect || {};
  const assert = parsed?.ci?.assert || {};
  const urls = Array.isArray(collect.url) ? collect.url.filter((u) => typeof u === "string" && u.length > 0) : [];
  const startServerCommand = typeof collect.startServerCommand === "string" ? collect.startServerCommand : "npm run start";
  const startServerReadyTimeout =
    Number.isFinite(Number(collect.startServerReadyTimeout)) && Number(collect.startServerReadyTimeout) > 0
      ? Number(collect.startServerReadyTimeout)
      : 120000;
  const assertions = assert.assertions || {};

  if (urls.length === 0) {
    fail("No URLs configured in .lighthouserc.json under ci.collect.url.");
  }

  return {
    urls,
    startServerCommand,
    startServerReadyTimeout,
    assertions,
  };
}

function spawnCaptured(command, args, options = {}) {
  const { forward = true, ...spawnOptions } = options;
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...spawnOptions,
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      output += text;
      if (forward) process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      output += text;
      if (forward) process.stderr.write(text);
    });

    child.on("error", (error) => {
      resolveRun({ code: 1, output: `${output}\n${String(error)}` });
    });
    child.on("exit", (code) => {
      resolveRun({ code: code ?? 1, output });
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
      });
      if (res.status >= 200 && res.status < 500) return;
    } catch {
      // retry
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function normalizeThresholdMap(assertions) {
  const categories = ["performance", "accessibility", "best-practices", "seo"];
  const out = {};
  for (const category of categories) {
    const key = `categories:${category}`;
    const raw = assertions[key];
    if (!Array.isArray(raw)) continue;
    const options = raw[1];
    const min = Number(options?.minScore);
    if (!Number.isFinite(min)) continue;
    out[category] = min;
  }
  return out;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function safeSlug(url, index) {
  try {
    const u = new URL(url);
    const path = (u.pathname || "home").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
    return `${String(index + 1).padStart(2, "0")}-${path || "home"}`;
  } catch {
    return `${String(index + 1).padStart(2, "0")}-url`;
  }
}

async function killProcessTree(pid) {
  if (!pid || pid <= 0) return;
  if (process.platform === "win32") {
    await spawnCaptured(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `taskkill /PID ${pid} /T /F`], {
      env,
      cwd: ROOT,
      forward: false,
    });
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // ignore
  }
}

async function runWindowsFallback(config) {
  console.log("Windows LHCI fallback enabled: running Lighthouse directly against a managed Chrome instance.");
  const reportsDir = resolve(".lighthouseci", "manual");
  mkdirSync(reportsDir, { recursive: true });

  const server = spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", config.startServerCommand], {
    cwd: ROOT,
    env,
    stdio: "inherit",
  });

  let chrome = null;

  try {
    await waitForUrl(config.urls[0], config.startServerReadyTimeout);

    const chromeUserDataDir = join(runTmpDir, "chrome-profile");
    mkdirSync(chromeUserDataDir, { recursive: true });

    chrome = spawn(
      chromePath,
      [
        ...SAFE_CHROME_FLAGS,
        "--remote-debugging-port=9222",
        `--user-data-dir=${chromeUserDataDir}`,
      ],
      {
        cwd: ROOT,
        env,
        stdio: "ignore",
      }
    );

    await sleep(1500);

    const thresholds = normalizeThresholdMap(config.assertions);
    const warnings = [];
    const scoreLines = [];

    for (let i = 0; i < config.urls.length; i += 1) {
      const url = config.urls[i];
      const reportPath = join(reportsDir, `${safeSlug(url, i)}.json`);
      const run = await spawnCaptured(
        process.execPath,
        [
          LIGHTHOUSE_CLI_PATH,
          url,
          "--port=9222",
          "--quiet",
          "--output=json",
          "--output-path",
          reportPath,
          "--throttling-method=devtools",
          "--blocked-url-patterns=https://local.adguard.org/*",
          `--chrome-flags=${SAFE_CHROME_FLAGS.join(" ")}`,
        ],
        {
          cwd: ROOT,
          env,
          forward: false,
        }
      );

      if (run.code !== 0) {
        process.stderr.write(run.output);
        throw new Error(`Lighthouse failed for ${url} with exit code ${run.code}.`);
      }

      const lhr = readJson(reportPath);
      const categories = lhr.categories || {};
      const perf = Number(categories.performance?.score ?? 0);
      const a11y = Number(categories.accessibility?.score ?? 0);
      const best = Number(categories["best-practices"]?.score ?? 0);
      const seo = Number(categories.seo?.score ?? 0);

      scoreLines.push(
        `${url} -> perf ${perf.toFixed(2)}, a11y ${a11y.toFixed(2)}, best-practices ${best.toFixed(
          2
        )}, seo ${seo.toFixed(2)}`
      );

      for (const [category, min] of Object.entries(thresholds)) {
        const score = Number(categories[category]?.score ?? 0);
        if (score < min) {
          warnings.push(`${url}: ${category} score ${score.toFixed(2)} is below configured minimum ${min.toFixed(2)}.`);
        }
      }
    }

    console.log("\nLighthouse (Windows fallback) summary:");
    for (const line of scoreLines) console.log(`- ${line}`);
    for (const warning of warnings) console.warn(`WARN: ${warning}`);

    return 0;
  } finally {
    if (chrome?.pid) await killProcessTree(chrome.pid);
    if (server?.pid) await killProcessTree(server.pid);
  }
}

async function main() {
  const config = parseConfig();
  const localWindowsMode = process.platform === "win32" && !String(process.env.CI || "").trim();

  if (localWindowsMode) {
    const code = await runWindowsFallback(config);
    process.exit(code);
  }

  const autorun = await spawnCaptured(process.execPath, [LHCI_CLI_PATH, "autorun", "--config=.lighthouserc.json"], {
    cwd: ROOT,
    env,
  });

  if (autorun.code === 0) {
    process.exit(0);
  }

  const isWindowsCleanupEperm =
    process.platform === "win32" &&
    /EPERM, Permission denied/i.test(autorun.output) &&
    /chrome-launcher/i.test(autorun.output);

  const allowFallback = isWindowsCleanupEperm && !String(process.env.CI || "").trim();

  if (!allowFallback) {
    process.exit(autorun.code);
  }

  console.warn("Detected Windows chrome-launcher cleanup EPERM from LHCI; switching to local fallback runner.");
  const code = await runWindowsFallback(config);
  process.exit(code);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    try {
      rmSync(runTmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failure
    }
  });
