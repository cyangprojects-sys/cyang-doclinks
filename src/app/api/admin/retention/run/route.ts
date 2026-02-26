export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { runRetention } from "@/lib/retention";

export async function GET() {
  await requirePermission("retention.run");

  const res = await runRetention();
  return NextResponse.json({ ok: true, now: new Date().toISOString(), ...res });
}
