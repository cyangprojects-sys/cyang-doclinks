type PerfCounter = {
  key: string;
  count: number;
  errorCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
  lastSeenAt: number;
};

const MAX_ROUTE_KEYS = 256;
const MAX_QUERY_KEYS = 512;
const MAX_KEY_LEN = 220;
const routeCounters = new Map<string, PerfCounter>();
const queryCounters = new Map<string, PerfCounter>();

function telemetryEnabled() {
  const raw = String(process.env.PERF_TELEMETRY_ENABLED || "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

function clampKey(raw: unknown): string {
  const text = String(raw || "").trim().replace(/[\r\n\0]+/g, " ").replace(/\s+/g, " ");
  return text.slice(0, MAX_KEY_LEN);
}

function pruneMap(map: Map<string, PerfCounter>, maxEntries: number) {
  if (map.size < maxEntries) return;
  let victimKey: string | null = null;
  let victim: PerfCounter | null = null;
  for (const [key, value] of map) {
    if (!victim) {
      victimKey = key;
      victim = value;
      continue;
    }
    if (value.count < victim.count || (value.count === victim.count && value.lastSeenAt < victim.lastSeenAt)) {
      victimKey = key;
      victim = value;
    }
  }
  if (victimKey) map.delete(victimKey);
}

function bumpCounter(map: Map<string, PerfCounter>, key: string, maxEntries: number, durationMs: number, ok: boolean) {
  if (!key) return;
  const safeDurationMs = Math.max(0, Math.floor(durationMs));
  const now = Date.now();
  let counter = map.get(key);
  if (!counter) {
    pruneMap(map, maxEntries);
    counter = {
      key,
      count: 0,
      errorCount: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
      lastSeenAt: now,
    };
    map.set(key, counter);
  }
  counter.count += 1;
  if (!ok) counter.errorCount += 1;
  counter.totalDurationMs += safeDurationMs;
  counter.maxDurationMs = Math.max(counter.maxDurationMs, safeDurationMs);
  counter.lastSeenAt = now;
}

export function normalizeSqlFingerprint(strings: TemplateStringsArray | readonly string[]): string {
  const combined = Array.from(strings || [], (part) => String(part || ""))
    .join("?")
    .replace(/\s+/g, " ")
    .trim();
  return clampKey(combined || "sql:unknown");
}

export function recordQueryFrequency(args: {
  fingerprint: string;
  durationMs: number;
  ok: boolean;
}) {
  if (!telemetryEnabled()) return;
  bumpCounter(queryCounters, clampKey(args.fingerprint), MAX_QUERY_KEYS, args.durationMs, args.ok);
}

export function recordRouteFrequency(args: {
  pathname: string;
  method?: string;
  durationMs: number;
  ok: boolean;
}) {
  if (!telemetryEnabled()) return;
  const method = clampKey(String(args.method || "GET").toUpperCase()) || "GET";
  const pathname = clampKey(args.pathname || "/") || "/";
  bumpCounter(routeCounters, `${method} ${pathname}`, MAX_ROUTE_KEYS, args.durationMs, args.ok);
}

export async function withRequestTelemetry<T>(
  req: Request,
  work: () => Promise<T>,
  options?: { routeKey?: string }
): Promise<T> {
  const started = Date.now();
  const pathname = clampKey(options?.routeKey) || (() => {
    try {
      return new URL(req.url).pathname || "/";
    } catch {
      return "/";
    }
  })();

  try {
    const result = await work();
    const status =
      result instanceof Response
        ? result.status
        : typeof result === "object" &&
            result !== null &&
            "status" in (result as Record<string, unknown>) &&
            typeof (result as { status?: unknown }).status === "number"
          ? Number((result as { status?: number }).status)
          : 200;
    recordRouteFrequency({
      pathname,
      method: req.method,
      durationMs: Date.now() - started,
      ok: status < 500,
    });
    return result;
  } catch (error) {
    recordRouteFrequency({
      pathname,
      method: req.method,
      durationMs: Date.now() - started,
      ok: false,
    });
    throw error;
  }
}
