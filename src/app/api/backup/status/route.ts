import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { sql } from "@/lib/db";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";
import { withRequestTelemetry } from "@/lib/perfTelemetry";

export const runtime = "nodejs";
const MAX_BACKUP_STATUS_BODY_BYTES = 16 * 1024;
const MAX_DETAIL_STRING_LEN = 256;

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

function parseJsonBodyLength(req: NextRequest): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const out = Number(raw);
  return Number.isFinite(out) ? Math.max(0, Math.floor(out)) : 0;
}

function normalizeDetailString(value: unknown): string | null {
  const text = String(value || "").trim();
  if (!text || text.length > MAX_DETAIL_STRING_LEN || /[\r\n\0]/.test(text)) {
    return null;
  }
  return text;
}

async function findExistingBackupRunId(args: {
  source: string;
  backupFile: string | null;
  repository: string | null;
  runId: string | null;
  runAttempt: string | null;
}): Promise<string | null> {
  if (args.runId) {
    const rows = await sql<{ id: string }>`
      select id
      from public.backup_runs
      where coalesce(details->>'source', '') = ${args.source}
        and coalesce(details->>'run_id', '') = ${args.runId}
        and coalesce(details->>'run_attempt', '') = ${args.runAttempt || ""}
        and coalesce(details->>'repository', '') = ${args.repository || ""}
      order by created_at desc
      limit 1
    `;
    if (rows[0]?.id) return rows[0].id;
  }

  if (args.backupFile) {
    const rows = await sql<{ id: string }>`
      select id
      from public.backup_runs
      where coalesce(details->>'source', '') = ${args.source}
        and coalesce(details->>'backup_file', '') = ${args.backupFile}
      order by created_at desc
      limit 1
    `;
    if (rows[0]?.id) return rows[0].id;
  }

  return null;
}

export async function POST(req: NextRequest) {
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_BACKUP_STATUS_MS", 10_000);
  try {
    return await withRequestTelemetry(
      req,
      () => withRouteTimeout(
        (async () => {
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
        if (parseJsonBodyLength(req) > MAX_BACKUP_STATUS_BODY_BYTES) {
          return NextResponse.json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
        }

        const body = await req.json().catch(() => null);
        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
        }

        const payload = parsed.data;
        const source = normalizeDetailString(payload.source) || "github-actions";
        const repository = normalizeDetailString(payload.details?.repository);
        const runId = normalizeDetailString(payload.details?.run_id);
        const runAttempt = normalizeDetailString(payload.details?.run_attempt);
        const backupFile = normalizeDetailString(payload.backup_file);
        const details = {
          ...(payload.details || {}),
          source,
          backup_file: backupFile,
          reported_at: new Date().toISOString(),
        };

        const existingId = await findExistingBackupRunId({
          source,
          backupFile,
          repository,
          runId,
          runAttempt,
        });

        if (existingId) {
          await sql`
            update public.backup_runs
            set
              status = ${payload.status},
              details = ${JSON.stringify(details)}::jsonb
            where id = ${existingId}
          `;
        } else {
          await sql`
            insert into public.backup_runs (status, details)
            values (${payload.status}, ${JSON.stringify(details)}::jsonb)
          `;
        }

        return NextResponse.json({
          ok: true,
          status: payload.status,
          deduped: Boolean(existingId),
        });
        })(),
        timeoutMs
      ),
      { routeKey: "/api/backup/status" }
    );
  } catch (e: unknown) {
    if (isRouteTimeoutError(e)) {
      return NextResponse.json({ ok: false, error: "TIMEOUT" }, { status: 504 });
    }
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
