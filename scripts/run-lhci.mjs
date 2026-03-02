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

const child =
  process.platform === "win32"
    ? spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npx lhci autorun --config=.lighthouserc.json"], {
      stdio: "inherit",
      env,
    })
    : spawn("npx", ["lhci", "autorun", "--config=.lighthouserc.json"], {
      stdio: "inherit",
      env,
    });

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
