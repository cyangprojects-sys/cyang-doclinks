export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { processKeyRotationJobs } from "@/lib/keyRotationJobs";

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const maxJobs = Math.max(1, Math.min(25, Number(process.env.KEY_ROTATION_CRON_MAX_JOBS || 5)));
  const result = await processKeyRotationJobs({ maxJobs });
  return NextResponse.json({ ok: true, ...result });
}
