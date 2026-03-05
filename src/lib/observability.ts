import * as Sentry from "@sentry/nextjs";

type Severity = "debug" | "info" | "warn" | "error";

const MAX_EVENT_LEN = 80;
const MAX_MESSAGE_LEN = 240;
const MAX_CONTEXT_ENTRIES = 32;
const MAX_CONTEXT_KEY_LEN = 64;
const MAX_CONTEXT_VALUE_LEN = 240;
const MAX_WEBHOOK_URL_LEN = 2048;

function normalizeSeverity(value: Severity | undefined): Severity {
  return value === "debug" || value === "warn" || value === "error" ? value : "info";
}

function normalizeText(value: unknown, maxLen: number, fallback: string): string {
  const text = String(value || "").trim();
  if (!text) return fallback;
  if (/[\r\n\0]/.test(text)) return fallback;
  return text.slice(0, maxLen);
}

function normalizeContext(context: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!context || typeof context !== "object") return {};
  const out: Record<string, unknown> = {};
  const entries = Object.entries(context).slice(0, MAX_CONTEXT_ENTRIES);
  for (const [rawKey, rawValue] of entries) {
    const key = normalizeText(rawKey, MAX_CONTEXT_KEY_LEN, "");
    if (!key) continue;
    if (typeof rawValue === "string") {
      out[key] = rawValue.slice(0, MAX_CONTEXT_VALUE_LEN);
      continue;
    }
    if (typeof rawValue === "number" || typeof rawValue === "boolean" || rawValue == null) {
      out[key] = rawValue;
      continue;
    }
    out[key] = String(rawValue).slice(0, MAX_CONTEXT_VALUE_LEN);
  }
  return out;
}

function normalizeWebhookUrl(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw || raw.length > MAX_WEBHOOK_URL_LEN || /[\r\n\0]/.test(raw)) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function logStructured(args: {
  severity?: Severity;
  event: string;
  message: string;
  context?: Record<string, unknown>;
}) {
  const severity = normalizeSeverity(args.severity);
  const event = normalizeText(args.event, MAX_EVENT_LEN, "unknown_event");
  const message = normalizeText(args.message, MAX_MESSAGE_LEN, "no_message");
  const context = normalizeContext(args.context);
  const payload = {
    ts: new Date().toISOString(),
    severity,
    event,
    message,
    context,
  };

  const line = JSON.stringify(payload);
  if (severity === "error") {
    console.error(line);
    return;
  }
  if (severity === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export async function reportException(args: {
  error: unknown;
  event: string;
  context?: Record<string, unknown>;
}) {
  const event = normalizeText(args.event, MAX_EVENT_LEN, "unknown_event");
  const context = normalizeContext(args.context);
  const message = normalizeText(
    args.error instanceof Error ? args.error.message : String(args.error),
    MAX_MESSAGE_LEN,
    "unknown_error"
  );
  const err = args.error instanceof Error ? args.error : new Error(message);
  logStructured({
    severity: "error",
    event,
    message,
    context,
  });

  try {
    Sentry.withScope((scope) => {
      scope.setTag("event", event);
      scope.setContext("app_context", context);
      Sentry.captureException(err);
    });
  } catch {
    // ignore secondary failures
  }

  // Optional external sink (Sentry-compatible via your own bridge endpoint).
  const hook = normalizeWebhookUrl(process.env.OBSERVABILITY_ERROR_WEBHOOK);
  if (hook) {
    try {
      await fetch(hook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event,
          message,
          context,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch {
      // ignore secondary failures
    }
  }
}
