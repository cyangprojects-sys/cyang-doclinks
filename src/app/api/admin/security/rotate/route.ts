import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/authz";
import { rotateDocKeys } from "@/lib/masterKeys";
import { logSecurityEvent } from "@/lib/securityTelemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  from_key_id: z.string().min(1),
  to_key_id: z.string().optional(),
  limit: z.number().int().positive().max(2000).optional(),
});

export async function POST(req: Request) {
  try {
    const u = await requireRole("owner");
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

    const res = await rotateDocKeys({
      fromKeyId: parsed.data.from_key_id,
      toKeyId: parsed.data.to_key_id,
      limit: parsed.data.limit ?? 250,
    });

    void logSecurityEvent({
      type: "master_key_rotate",
      severity: "medium",
      actorUserId: u.id,
      orgId: u.orgId ?? null,
      scope: "crypto",
      message: "Rewrapped document data keys",
      meta: { from: parsed.data.from_key_id, to: parsed.data.to_key_id ?? "active", rotated: res.rotated },
    });

    return NextResponse.json({ ok: true, rotated: res.rotated });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const status = msg === "FORBIDDEN" || msg === "UNAUTHENTICATED" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
