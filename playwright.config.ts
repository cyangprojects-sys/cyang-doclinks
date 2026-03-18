import { defineConfig } from "@playwright/test";
import { config as loadDotenv } from "dotenv";

const existingNodeEnv = process.env.NODE_ENV;
loadDotenv({ path: ".env.local", quiet: true });
const mutableEnv = process.env as Record<string, string | undefined>;
if (typeof existingNodeEnv === "string") {
  mutableEnv.NODE_ENV = existingNodeEnv;
} else {
  delete mutableEnv.NODE_ENV;
}

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
