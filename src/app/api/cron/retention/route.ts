export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { runRetention } from "@/lib/retention";
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
  const retention = await runRetention();

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    retention,
  });
}
