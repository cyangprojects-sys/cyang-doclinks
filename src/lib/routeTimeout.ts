export class RouteTimeoutError extends Error {
  constructor(message = "ROUTE_TIMEOUT") {
    super(message);
    this.name = "RouteTimeoutError";
  }
}

const MIN_ENV_ROUTE_TIMEOUT_MS = 1_000;
const MAX_ROUTE_TIMEOUT_MS = 180_000;
const DEFAULT_ROUTE_TIMEOUT_MS = 30_000;
const SAFE_ENV_NAME_RE = /^[A-Z0-9_]{1,64}$/;

function clampTimeoutMs(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const floored = Math.floor(n);
  if (floored < min) return min;
  if (floored > max) return max;
  return floored;
}

export function isRouteTimeoutError(err: unknown): err is RouteTimeoutError {
  return err instanceof RouteTimeoutError || (err instanceof Error && err.message === "ROUTE_TIMEOUT");
}

export function getRouteTimeoutMs(envName: string, fallbackMs: number): number {
  const fallback = clampTimeoutMs(
    fallbackMs,
    MIN_ENV_ROUTE_TIMEOUT_MS,
    MAX_ROUTE_TIMEOUT_MS,
    DEFAULT_ROUTE_TIMEOUT_MS
  );
  const safeEnvName = String(envName || "").trim();
  if (!SAFE_ENV_NAME_RE.test(safeEnvName)) return fallback;

  const raw = Number(process.env[safeEnvName] || "");
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return clampTimeoutMs(raw, MIN_ENV_ROUTE_TIMEOUT_MS, MAX_ROUTE_TIMEOUT_MS, fallback);
}

export async function withRouteTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  const safeTimeoutMs = clampTimeoutMs(timeoutMs, 1, MAX_ROUTE_TIMEOUT_MS, DEFAULT_ROUTE_TIMEOUT_MS);
  let timer: NodeJS.Timeout | null = null;
  try {
    const timeout = new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new RouteTimeoutError()), safeTimeoutMs);
    });
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
