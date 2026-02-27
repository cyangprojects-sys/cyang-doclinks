import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ADMIN_API_DIR = path.join(ROOT, "src", "app", "api", "admin");
const DEBUG_ROUTE = path.join(ADMIN_API_DIR, "debug", "route.ts");

const GUARD_PATTERNS = [
  "requirePermission(",
  "requireRole(",
  "requireUser(",
  "requireDocWrite(",
];

function listRouteFiles(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...listRouteFiles(full));
      continue;
    }
    if (ent.isFile() && ent.name === "route.ts") out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

function hasAnyGuard(src) {
  return GUARD_PATTERNS.some((p) => src.includes(p));
}

function isStaticNotFoundRoute(src) {
  const hasNotFoundToken = src.includes("not_found") || src.includes("NOT_FOUND");
  const has404 = src.includes("status: 404");
  const noDbAccess = !src.includes("sql`") && !src.includes("r2Client") && !src.includes("stripeApi(");
  return hasNotFoundToken && has404 && noDbAccess;
}

function auditAdminRouteGuards() {
  if (!fs.existsSync(ADMIN_API_DIR)) {
    throw new Error(`Missing directory: ${rel(ADMIN_API_DIR)}`);
  }

  const files = listRouteFiles(ADMIN_API_DIR);
  const missingGuard = [];

  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    if (!hasAnyGuard(src) && !isStaticNotFoundRoute(src)) missingGuard.push(rel(file));
  }

  const debugErrors = [];
  if (fs.existsSync(DEBUG_ROUTE)) {
    const src = fs.readFileSync(DEBUG_ROUTE, "utf8");
    if (!src.includes("ADMIN_DEBUG_ENABLED")) {
      debugErrors.push(`${rel(DEBUG_ROUTE)} missing ADMIN_DEBUG_ENABLED production gate.`);
    }
    if (!src.includes('requireRole("owner")')) {
      debugErrors.push(`${rel(DEBUG_ROUTE)} missing owner-role guard.`);
    }
  }

  if (missingGuard.length || debugErrors.length) {
    const lines = [
      "Admin route guard audit failed.",
      ...(missingGuard.length
        ? ["Routes missing explicit guard call:", ...missingGuard.map((f) => `- ${f}`)]
        : []),
      ...(debugErrors.length ? ["Debug route policy failures:", ...debugErrors.map((e) => `- ${e}`)] : []),
    ];
    throw new Error(lines.join("\n"));
  }

  console.log(`Admin route guard audit passed (${files.length} route files checked).`);
}

try {
  auditAdminRouteGuards();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
