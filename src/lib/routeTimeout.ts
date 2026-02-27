export class RouteTimeoutError extends Error {
  constructor(message = "ROUTE_TIMEOUT") {
    super(message);
    this.name = "RouteTimeoutError";
  }
}

export function isRouteTimeoutError(err: unknown): err is RouteTimeoutError {
  return err instanceof RouteTimeoutError || (err instanceof Error && err.message === "ROUTE_TIMEOUT");
}

export function getRouteTimeoutMs(envName: string, fallbackMs: number): number {
  const raw = Number(process.env[envName] || "");
  if (!Number.isFinite(raw) || raw <= 0) return fallbackMs;
  return Math.max(1_000, Math.min(180_000, Math.floor(raw)));
}

export async function withRouteTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    const timeout = new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new RouteTimeoutError()), timeoutMs);
    });
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
