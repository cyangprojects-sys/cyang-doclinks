#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const checks = [
  {
    file: "src/app/admin/DeleteDocForm.tsx",
    forbidden: ["router.refresh(", "window.setInterval(", "setInterval(", "window.setTimeout(", "setTimeout("],
    required: ["onDeleted(docId)"],
  },
  {
    file: "src/app/admin/dashboard/UploadPanel.tsx",
    forbidden: ["window.setInterval(", "setInterval(", "/api/admin/upload/status"],
    required: ["useAdminDocumentStatusPolling"],
  },
  {
    file: "src/hooks/useAdminDocumentStatusPolling.ts",
    forbidden: ["window.setInterval(", "setInterval(", "/api/admin/upload/status"],
    required: ["/api/viewer/docs/status", "useStatusSignaturePolling"],
  },
  {
    file: "src/app/admin/dashboard/DocumentsWorkspaceClient.tsx",
    forbidden: ["router.refresh(", "window.setInterval(", "setInterval("],
    required: ["useAdminDocumentStatusPolling", "externalStatusSnapshots={rowStatusMap}"],
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
    file: "src/app/admin/dashboard/UnifiedDocsTableClient.tsx",
    forbidden: ["router.refresh(", "window.setInterval(", "setInterval(", "useConditionalPolling("],
    required: ["onDocDeleted?.(docId)", "onDocsDeleted?.(selectedIds)"],
  },
  {
    file: "src/app/admin/(owner)/security/SecurityTablesAutoRefresh.tsx",
    forbidden: ["window.setInterval(", "setInterval(", "useConditionalPolling("],
    required: ["useStatusSignaturePolling"],
  },
  {
    file: "src/app/admin/(owner)/security/KeyManagementPanel.tsx",
    forbidden: ["window.setInterval(", "setInterval(", "useConditionalPolling("],
    required: ["useStatusSignaturePolling"],
  },
  {
    file: "src/app/d/[alias]/ScanAutoRefresh.tsx",
    forbidden: ["window.setInterval(", "setInterval(", "window.setTimeout(", "setTimeout("],
    required: ["useStatusSignaturePolling", "status_signature"],
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
