// src/app/api/admin/upload/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/authz";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";

export async function GET(req: NextRequest) {
    const rl = await enforceGlobalApiRateLimit({
        req,
        scope: "ip:admin_upload_route",
        limit: Number(process.env.RATE_LIMIT_ADMIN_UPLOAD_ROUTE_PER_MIN || 60),
        windowSeconds: 60,
        strict: true,
    });
    if (!rl.ok) {
        return NextResponse.json(
            { ok: false, error: "RATE_LIMIT" },
            { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
        );
    }
    await requireRole("admin");
    return NextResponse.json(
        { ok: false, error: "not_found", message: "Use /admin/upload" },
        { status: 404 }
    );
}
