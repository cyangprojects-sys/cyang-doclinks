export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { isDebugApiEnabled } from "@/lib/debugAccess";
import { getPerfTelemetrySnapshot, withRequestTelemetry } from "@/lib/perfTelemetry";

function clampLimit(raw: string | null, fallback: number): number {
  const value = Number(String(raw || "").trim());
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(value)));
}

export async function GET(req: NextRequest) {
  try {
    return await withRequestTelemetry(
      req,
      async () => {
        if (!isDebugApiEnabled()) {
          return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
        }

        await requireRole("owner");

        const routeLimit = clampLimit(req.nextUrl.searchParams.get("routeLimit"), 20);
        const queryLimit = clampLimit(req.nextUrl.searchParams.get("queryLimit"), 20);

        return NextResponse.json(
          getPerfTelemetrySnapshot({ routeLimit, queryLimit }),
          { status: 200, headers: { "Cache-Control": "private, no-store, max-age=0" } }
        );
      },
      { routeKey: "/api/admin/debug/telemetry" }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
