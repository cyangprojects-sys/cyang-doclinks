export type RuntimeEnvScope =
  | "serve"
  | "share_raw"
  | "alias_raw"
  | "ticket_serve"
  | "upload_complete"
  | "upload_presign"
  | "stripe_webhook"
  | "stripe_admin";

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
  return String(process.env[name] || "").trim().length > 0;
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

  // Most runtime server routes require DB.
  if (scope !== "upload_presign") {
    require("DATABASE_URL");
  } else {
    require("DATABASE_URL");
  }

  switch (scope) {
    case "serve":
    case "share_raw":
    case "alias_raw":
    case "ticket_serve":
      requireAny(["VIEW_SALT", "NEXTAUTH_SECRET"], "VIEW_SALT|NEXTAUTH_SECRET");
      break;
    case "upload_complete":
      require("DOC_MASTER_KEYS");
      require("R2_BUCKET");
      require("R2_ENDPOINT");
      require("R2_ACCESS_KEY_ID");
      require("R2_SECRET_ACCESS_KEY");
      break;
    case "upload_presign":
      require("DOC_MASTER_KEYS");
      require("R2_BUCKET");
      require("R2_ENDPOINT");
      require("R2_ACCESS_KEY_ID");
      require("R2_SECRET_ACCESS_KEY");
      break;
    case "stripe_webhook":
      require("STRIPE_WEBHOOK_SECRET");
      break;
    case "stripe_admin":
      require("STRIPE_SECRET_KEY");
      break;
  }

  return Array.from(missing.values()).sort();
}

export function assertRuntimeEnv(scope: RuntimeEnvScope): void {
  if (!isStrictValidationEnabled()) return;
  const missing = requiredForScope(scope);
  if (missing.length) {
    throw new RuntimeEnvError(scope, missing);
  }
}
