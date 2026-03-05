export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/authz";
import { isDebugApiEnabled } from "@/lib/debugAccess";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";

async function regclass(name: string) {
  const rows = (await sql`select to_regclass(${name})::text as reg`) as { reg: string | null }[];
  return rows?.[0]?.reg ?? null;
}

export async function GET(req: NextRequest) {
  if (!isDebugApiEnabled()) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
  const rl = await enforceGlobalApiRateLimit({
    req,
    scope: "ip:admin_dbinfo",
    limit: Number(process.env.RATE_LIMIT_ADMIN_DBINFO_PER_MIN || 60),
    windowSeconds: 60,
    strict: true,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMIT" },
      { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }
  try {
    await requireRole("owner");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_ADMIN_DBINFO_MS", 10_000);
  try {
    return await withRouteTimeout(
      (async () => {
        const tables = {
          "public.doc_audit": Boolean(await regclass("public.doc_audit")),
          "public.doc_access_log": Boolean(await regclass("public.doc_access_log")),
          "public.doc_views": Boolean(await regclass("public.doc_views")),
          "public.docs": Boolean(await regclass("public.docs")),
          "public.documents": Boolean(await regclass("public.documents")),
        };

        return NextResponse.json({
          ok: true,
          now: new Date().toISOString(),
          tables,
        });
      })(),
      timeoutMs
    );
  } catch (e: unknown) {
    if (isRouteTimeoutError(e)) {
      return NextResponse.json({ ok: false, error: "TIMEOUT" }, { status: 504 });
    }
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
