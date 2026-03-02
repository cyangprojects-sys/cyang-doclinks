import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const chromePath = chromium.executablePath();
const tmpDir = resolve(".tmp", "lhci");
mkdirSync(tmpDir, { recursive: true });
const env = {
  ...process.env,
  CHROME_PATH: chromePath,
  TMP: tmpDir,
  TEMP: tmpDir,
};

const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(npxBin, ["lhci", "autorun", "--config=.lighthouserc.json"], {
  stdio: "inherit",
  env,
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
