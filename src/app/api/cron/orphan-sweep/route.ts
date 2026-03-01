export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { logCronRun } from "@/lib/cronTelemetry";
import { runR2OrphanSweep } from "@/lib/retention";

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json(
      {
        ok: false,
        error: "UNAUTHORIZED",
        hint: "Set CRON_SECRET in Vercel env vars.",
      },
      { status: 401 }
    );
  }

  const startedAt = Date.now();
  try {
    const url = new URL(req.url);
    const deleteFlag = ["1", "true", "yes", "on"].includes((url.searchParams.get("delete") || "").toLowerCase());
    const maxObjectsRaw = Number(url.searchParams.get("maxObjects") || "");
    const maxObjects = Number.isFinite(maxObjectsRaw) ? Math.max(1, Math.min(50_000, Math.floor(maxObjectsRaw))) : undefined;

    const result = await runR2OrphanSweep({
      deleteOrphans: deleteFlag || undefined,
      maxObjects,
    });

    const duration = Date.now() - startedAt;
    await logCronRun({
      job: "orphan_sweep",
      ok: result.ok,
      durationMs: duration,
      meta: {
        scanned: result.scanned ?? null,
        deleted: result.deleted ?? null,
        note: result.note ?? null,
      },
    });

    return NextResponse.json({
      ok: result.ok,
      now: new Date().toISOString(),
      duration_ms: duration,
      result,
    });
  } catch (e: unknown) {
    const duration = Date.now() - startedAt;
    const msg = e instanceof Error ? e.message : String(e);
    await logCronRun({
      job: "orphan_sweep",
      ok: false,
      durationMs: duration,
      meta: { error: msg },
    });
    return NextResponse.json({ ok: false, error: "CRON_ORPHAN_SWEEP_FAILED" }, { status: 500 });
  }
}
