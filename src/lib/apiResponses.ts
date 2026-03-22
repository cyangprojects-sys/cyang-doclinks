import { NextResponse } from "next/server";

type ErrorResponseOptions = {
  message?: string;
  headers?: HeadersInit;
};

export function jsonError(
  error: string,
  status: number,
  options: ErrorResponseOptions = {}
) {
  const body: { ok: false; error: string; message?: string } = {
    ok: false,
    error,
  };

  if (options.message) {
    body.message = options.message;
  }

  return NextResponse.json(body, {
    status,
    headers: options.headers,
  });
}

export function jsonRateLimitError(status: number, retryAfterSeconds: number) {
  return jsonError("RATE_LIMIT", status, {
    headers: { "Retry-After": String(retryAfterSeconds) },
  });
}
