export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { aggregateDocViewDaily } from "@/lib/analytics";
import { isCronAuthorized } from "@/lib/cronAuth";

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
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

  // Optional query param: ?daysBack=120
  const url = new URL(req.url);
  const daysBackRaw = (url.searchParams.get("daysBack") || "").trim();
  const daysBack = daysBackRaw ? Math.max(1, Math.min(3650, Number(daysBackRaw) || 0)) : undefined;

  const aggregate = await aggregateDocViewDaily(daysBack ? { daysBack: Math.floor(daysBack) } : undefined);

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    aggregate,
  });
}
