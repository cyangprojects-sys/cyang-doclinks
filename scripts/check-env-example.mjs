#!/usr/bin/env node

import { analyzeEnvExample } from "./lib/env-example-audit.mjs";

function main() {
  const report = analyzeEnvExample(process.cwd());

  if (report.missing.length) {
    console.error("Missing keys in .env.example:");
    for (const key of report.missing) {
      console.error(`  - ${key}`);
    }
    process.exit(1);
  }

  if (report.unexpectedExtra.length) {
    console.error("Unexpected extra keys in .env.example (not statically referenced and not listed in the intentional-extra manifest):");
    for (const key of report.unexpectedExtra) {
      console.error(`  - ${key}`);
    }
    process.exit(1);
  }

  if (report.intentionalExtra.length) {
    console.log("Intentional extra keys in .env.example:");
    for (const [groupName, group] of Object.entries(report.intentionalExtraGroups)) {
      const keys = group.keys.filter((key) => report.intentionalExtra.includes(key));
      if (!keys.length) continue;
      console.log(`  ${groupName}: ${group.description}`);
      for (const key of keys) {
        console.log(`    - ${key}`);
      }
    }
  }

  if (report.staleAllowlist.length) {
    console.error("The intentional-extra env allowlist contains keys that are statically referenced and should be removed from the manifest:");
    for (const key of report.staleAllowlist) {
      console.error(`  - ${key}`);
    }
    process.exit(1);
  }

  console.log(
    `.env.example check passed. Keys referenced: ${report.usedKeys.size}. Keys in template: ${report.exampleKeys.size}. Intentional extras: ${report.intentionalExtra.length}.`
  );
}

main();
