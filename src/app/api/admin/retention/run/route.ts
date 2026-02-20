export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { runRetention } from "@/lib/retention";

export async function GET() {
  await requireRole("admin");

  const res = await runRetention();
  return NextResponse.json({ ok: true, now: new Date().toISOString(), ...res });
}
