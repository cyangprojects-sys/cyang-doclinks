import * as Sentry from "@sentry/nextjs";

type Severity = "debug" | "info" | "warn" | "error";

export function logStructured(args: {
  severity?: Severity;
  event: string;
  message: string;
  context?: Record<string, unknown>;
}) {
  const payload = {
    ts: new Date().toISOString(),
    severity: args.severity ?? "info",
    event: args.event,
    message: args.message,
    context: args.context ?? {},
  };

  const line = JSON.stringify(payload);
  if ((args.severity ?? "info") === "error") {
    console.error(line);
    return;
  }
  if ((args.severity ?? "info") === "warn") {
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
  const message = args.error instanceof Error ? args.error.message : String(args.error);
  const err = args.error instanceof Error ? args.error : new Error(message);
  logStructured({
    severity: "error",
    event: args.event,
    message,
    context: args.context ?? {},
  });

  try {
    Sentry.withScope((scope) => {
      scope.setTag("event", args.event);
      if (args.context) scope.setContext("app_context", args.context);
      Sentry.captureException(err);
    });
  } catch {
    // ignore secondary failures
  }

  // Optional external sink (Sentry-compatible via your own bridge endpoint).
  const hook = String(process.env.OBSERVABILITY_ERROR_WEBHOOK || "").trim();
  if (hook) {
    try {
      await fetch(hook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event: args.event,
          message,
          context: args.context ?? {},
          timestamp: new Date().toISOString(),
        }),
      });
    } catch {
      // ignore secondary failures
    }
  }
}
