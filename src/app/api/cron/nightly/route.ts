export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { aggregateDocViewDaily } from "@/lib/analytics";
import { runRetention } from "@/lib/retention";

function isAuthorized(req: NextRequest): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  // If no secret is configured, refuse to run.
  if (!secret) return false;

  const auth = (req.headers.get("authorization") || "").trim();
  if (!auth) return false;

  // Vercel sends CRON_SECRET via Authorization header.
  // Be tolerant to formats ("Bearer <secret>" or just "<secret>").
  if (auth === secret) return true;
  if (auth.toLowerCase().startsWith("bearer ") && auth.slice(7).trim() === secret) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      {
        ok: false,
        error: "UNAUTHORIZED",
        hint:
          "Set CRON_SECRET in Vercel env vars. Vercel will send it as the Authorization header for cron invocations.",
      },
      { status: 401 }
    );
  }

  const startedAt = Date.now();

  // 1) Aggregate daily view counts
  const aggregate = await aggregateDocViewDaily();

  // 2) Retention cleanup for raw/high-volume tables
  const retention = await runRetention();

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    aggregate,
    retention,
  });
}
