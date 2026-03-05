import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { sql } from "@/lib/db";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  status: z.enum(["ok", "failed", "skipped", "success"]).default("ok"),
  source: z.string().trim().max(128).optional(),
  backup_file: z.string().trim().max(512).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

function isAuthorized(req: NextRequest): boolean {
  const expected = String(process.env.BACKUP_STATUS_WEBHOOK_TOKEN || "").trim();
  if (!expected) return false;
  const auth = String(req.headers.get("authorization") || "").trim();
  if (!auth) return false;
  const matches = (candidate: string) => {
    const a = Buffer.from(candidate);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  };
  if (matches(auth)) return true;
  if (auth.toLowerCase().startsWith("bearer ") && matches(auth.slice(7).trim())) return true;
  return false;
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }
    const rl = await enforceGlobalApiRateLimit({
      req,
      scope: "ip:backup_status",
      limit: Number(process.env.RATE_LIMIT_BACKUP_STATUS_IP_PER_MIN || 30),
      windowSeconds: 60,
      strict: true,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: "RATE_LIMIT" },
        { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
    }

    const payload = parsed.data;
    const details = {
      source: payload.source || "github-actions",
      backup_file: payload.backup_file || null,
      reported_at: new Date().toISOString(),
      ...(payload.details || {}),
    };

    await sql`
      insert into public.backup_runs (status, details)
      values (${payload.status}, ${JSON.stringify(details)}::jsonb)
    `;

    return NextResponse.json({ ok: true, status: payload.status });
  } catch {
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
