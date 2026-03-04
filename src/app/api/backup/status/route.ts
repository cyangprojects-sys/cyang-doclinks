import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  status: z.enum(["ok", "failed", "skipped", "success"]).default("ok"),
  source: z.string().trim().max(128).optional(),
  backup_file: z.string().trim().max(512).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

function authorized(req: NextRequest): boolean {
  const expected = String(process.env.BACKUP_STATUS_WEBHOOK_TOKEN || "").trim();
  if (!expected) return false;
  const auth = String(req.headers.get("authorization") || "").trim();
  if (!auth) return false;
  if (auth === expected) return true;
  if (auth.toLowerCase().startsWith("bearer ") && auth.slice(7).trim() === expected) return true;
  return false;
}

export async function POST(req: NextRequest) {
  try {
    if (!authorized(req)) {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
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

