#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const checks = [
  {
    file: "src/app/admin/DeleteDocForm.tsx",
    forbidden: ["window.setInterval(", "setInterval(", "window.setTimeout(", "setTimeout("],
    required: [],
  },
  {
    file: "src/app/admin/dashboard/SharesTableClient.tsx",
    forbidden: ["router.refresh(", "window.setInterval(", "setInterval("],
    required: [],
  },
  {
    file: "src/app/admin/dashboard/ViewsByDocTableClient.tsx",
    forbidden: ["router.refresh(", "window.setInterval(", "setInterval("],
    required: [],
  },
  {
    file: "src/app/admin/(owner)/security/SecurityTablesAutoRefresh.tsx",
    forbidden: ["window.setInterval(", "setInterval("],
    required: ["useConditionalPolling("],
  },
  {
    file: "src/app/admin/(owner)/security/KeyManagementPanel.tsx",
    forbidden: ["window.setInterval(", "setInterval("],
    required: ["useConditionalPolling("],
  },
  {
    file: "src/app/d/[alias]/ScanAutoRefresh.tsx",
    forbidden: ["window.setInterval(", "setInterval(", "window.setTimeout(", "setTimeout("],
    required: ["useConditionalPolling("],
  },
];

const findings = [];

for (const check of checks) {
  const code = readFileSync(resolve(check.file), "utf8");
  for (const token of check.forbidden) {
    if (code.includes(token)) {
      findings.push(`${check.file}: forbidden polling token "${token}" found`);
    }
  }
  for (const token of check.required) {
    if (!code.includes(token)) {
      findings.push(`${check.file}: required token "${token}" missing`);
    }
  }
}

if (findings.length) {
  console.error("Admin polling audit failed:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("Admin polling audit passed.");
