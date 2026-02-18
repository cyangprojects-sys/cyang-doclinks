// src/app/api/admin/upload/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json(
        { ok: false, error: "not_found", message: "Use /admin/upload" },
        { status: 404 }
    );
}
