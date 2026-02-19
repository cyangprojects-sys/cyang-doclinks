export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/owner";
import { runRetention } from "@/lib/retention";

export async function GET() {
  const owner = await requireOwner();
  if (!owner.ok) {
    return NextResponse.json(
      { ok: false, error: owner.reason },
      { status: owner.reason === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  const res = await runRetention();
  return NextResponse.json({ ok: true, now: new Date().toISOString(), ...res });
}
