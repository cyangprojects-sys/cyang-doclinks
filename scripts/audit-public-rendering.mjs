#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PUBLIC_PAGE_FILES = [
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
  "src/app/status/page.tsx",
  "src/app/security-disclosure/page.tsx",
];

const PUBLIC_SHELL_FILES = [
  "src/app/components/SiteShell.tsx",
  "src/app/components/SiteHeader.tsx",
  "src/app/components/SiteFooter.tsx",
  "src/lib/publicRuntimeConfig.ts",
];

const FORBIDDEN_PATTERNS = [
  {
    label: 'force-dynamic',
    test: (code) => code.includes('export const dynamic = "force-dynamic"'),
  },
  {
    label: "revalidate=0",
    test: (code) => /export\s+const\s+revalidate\s*=\s*0\b/.test(code),
  },
  {
    label: 'cache: "no-store"',
    test: (code) => code.includes('cache: "no-store"'),
  },
];

const FORBIDDEN_PUBLIC_SHELL_IMPORTS = [
  '@/lib/settings',
  "@/lib/settings",
  '@/lib/db',
  "@/lib/db",
  'getBillingFlags(',
  'sql`',
];

const findings = [];

for (const file of PUBLIC_PAGE_FILES) {
  const code = readFileSync(resolve(file), "utf8");
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      findings.push(`${file}: ${pattern.label} is not allowed on public marketing/trust pages`);
    }
  }
}

for (const file of PUBLIC_SHELL_FILES) {
  const code = readFileSync(resolve(file), "utf8");
  for (const token of FORBIDDEN_PUBLIC_SHELL_IMPORTS) {
    if (code.includes(token)) {
      findings.push(`${file}: forbidden public-shell dependency "${token}"`);
    }
  }
}

if (findings.length) {
  console.error("Public rendering audit failed:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("Public rendering audit passed.");
