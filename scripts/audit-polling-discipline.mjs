#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const AUDITED_FILES = [
  "src/app/components/PublicFunnelTrackerDeferred.tsx",
  "src/app/components/SiteHeader.tsx",
  "src/app/components/SiteFooter.tsx",
  "src/app/components/SiteShell.tsx",
  "src/app/page.tsx",
  "src/app/about/page.tsx",
  "src/app/contact/page.tsx",
  "src/app/pricing/page.tsx",
  "src/app/projects/page.tsx",
  "src/app/projects/doclinks/page.tsx",
  "src/app/trust/page.tsx",
  "src/app/trust/procurement/page.tsx",
  "src/app/legal/page.tsx",
  "src/app/legal/[slug]/page.tsx",
  "src/app/data-retention/page.tsx",
  "src/app/report/page.tsx",
  "src/app/security-disclosure/page.tsx",
  "src/app/status/StatusCenterClient.tsx",
];

const ALLOWLIST = new Set([
  "src/app/status/StatusCenterClient.tsx",
]);

const findings = [];

for (const file of AUDITED_FILES) {
  const code = readFileSync(resolve(file), "utf8");
  const hasPolling =
    code.includes("setInterval(") ||
    code.includes("window.setInterval(") ||
    code.includes("router.refresh(");
  if (hasPolling && !ALLOWLIST.has(file)) {
    findings.push(`${file}: hidden polling or refresh loop is not allowed on public surfaces`);
  }
}

if (findings.length) {
  console.error("Polling discipline audit failed:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("Polling discipline audit passed.");
