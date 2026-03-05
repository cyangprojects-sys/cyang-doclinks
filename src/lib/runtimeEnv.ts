import { validateDocMasterKeysConfig } from "@/lib/encryption";

export type RuntimeEnvScope =
  | "serve"
  | "share_raw"
  | "alias_raw"
  | "ticket_serve"
  | "upload_complete"
  | "upload_presign"
  | "stripe_webhook"
  | "stripe_admin";

const RUNTIME_ENV_SCOPES: ReadonlyArray<RuntimeEnvScope> = [
  "serve",
  "share_raw",
  "alias_raw",
  "ticket_serve",
  "upload_complete",
  "upload_presign",
  "stripe_webhook",
  "stripe_admin",
];

export class RuntimeEnvError extends Error {
  readonly scope: RuntimeEnvScope;
  readonly missing: string[];

  constructor(scope: RuntimeEnvScope, missing: string[]) {
    super(`ENV_MISCONFIGURED:${scope}:${missing.join(",")}`);
    this.name = "RuntimeEnvError";
    this.scope = scope;
    this.missing = missing;
  }
}

export function isRuntimeEnvError(err: unknown): err is RuntimeEnvError {
  return err instanceof RuntimeEnvError;
}

function isStrictValidationEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  const raw = String(process.env.ENABLE_STRICT_ENV_VALIDATION || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function hasEnv(name: string): boolean {
  const raw = String(process.env[name] || "");
  if (!raw.trim()) return false;
  return !/[\r\n\0]/.test(raw);
}

function hasAnyEnv(names: string[]): boolean {
  return names.some((n) => hasEnv(n));
}

function requiredForScope(scope: RuntimeEnvScope): string[] {
  const missing = new Set<string>();
  const require = (name: string) => {
    if (!hasEnv(name)) missing.add(name);
  };
  const requireAny = (names: string[], label: string) => {
    if (!hasAnyEnv(names)) missing.add(label);
  };
  const requireDocMasterKeys = () => {
    require("DOC_MASTER_KEYS");
    const raw = process.env.DOC_MASTER_KEYS;
    if (!raw) return;
    const valid = validateDocMasterKeysConfig(raw);
    if (!valid.ok) missing.add("DOC_MASTER_KEYS_JSON");
  };

  require("DATABASE_URL");

  switch (scope) {
    case "serve":
    case "share_raw":
    case "alias_raw":
    case "ticket_serve":
      requireAny(["VIEW_SALT", "NEXTAUTH_SECRET"], "VIEW_SALT|NEXTAUTH_SECRET");
      requireDocMasterKeys();
      break;
    case "upload_complete":
      requireDocMasterKeys();
      require("R2_BUCKET");
      require("R2_ENDPOINT");
      require("R2_ACCESS_KEY_ID");
      require("R2_SECRET_ACCESS_KEY");
      require("UPLOAD_ABSOLUTE_MAX_BYTES");
      require("PDF_MAX_PAGES");
      break;
    case "upload_presign":
      requireDocMasterKeys();
      require("R2_BUCKET");
      require("R2_ENDPOINT");
      require("R2_ACCESS_KEY_ID");
      require("R2_SECRET_ACCESS_KEY");
      require("UPLOAD_ABSOLUTE_MAX_BYTES");
      break;
    case "stripe_webhook":
      require("STRIPE_WEBHOOK_SECRET");
      require("STRIPE_PRO_PRICE_IDS");
      break;
    case "stripe_admin":
      require("STRIPE_SECRET_KEY");
      require("STRIPE_PRO_PRICE_IDS");
      break;
  }

  return Array.from(missing.values()).sort();
}

export function assertRuntimeEnv(scope: RuntimeEnvScope): void {
  if (!isStrictValidationEnabled()) return;
  if (!RUNTIME_ENV_SCOPES.includes(scope)) {
    throw new RuntimeEnvError("serve", ["RUNTIME_ENV_SCOPE"]);
  }
  const missing = requiredForScope(scope);
  if (missing.length) {
    throw new RuntimeEnvError(scope, missing);
  }
}
