// src/app/api/admin/upload/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";

export async function GET() {
    await requireRole("admin");
    return NextResponse.json(
        { ok: false, error: "not_found", message: "Use /admin/upload" },
        { status: 404 }
    );
}
