#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

function listRouteFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const next = join(dir, name);
    const st = statSync(next);
    if (st.isDirectory()) {
      out.push(...listRouteFiles(next));
      continue;
    }
    if (name === "route.ts") out.push(next);
  }
  return out;
}

const ROUTE_FILES = listRouteFiles(resolve("src/app"));
const findings = [];

for (const file of ROUTE_FILES) {
  const code = readFileSync(resolve(file), "utf8");
  if (code.includes('export const dynamic = "force-dynamic"')) {
    findings.push(
      `${file}: route handlers should not declare force-dynamic; request-time behavior should be expressed through method semantics, auth checks, and response cache headers instead.`
    );
  }
  if (/export\s+const\s+revalidate\s*=\s*0\b/.test(code)) {
    findings.push(
      `${file}: route handlers should not declare revalidate = 0; disable caching through response headers on sensitive responses instead.`
    );
  }
}

if (findings.length) {
  console.error("Route handler rendering audit failed:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("Route handler rendering audit passed.");
