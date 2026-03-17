export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { verifyApiKeyFromRequest } from "@/lib/apiAuth";
import { emitWebhook } from "@/lib/webhooks";
import { clientIpKey, enforceGlobalApiRateLimit, logDbErrorEvent } from "@/lib/securityTelemetry";
import { appendImmutableAudit } from "@/lib/immutableAudit";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";
import { withRequestTelemetry } from "@/lib/perfTelemetry";

type PgErrorLike = { code?: unknown; message?: unknown };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ALIASES_BODY_BYTES = 16 * 1024;
const MAX_ALIAS_TTL_DAYS = 365;
const MIN_ALIAS_TTL_DAYS = 1;

function isUuid(value: string): boolean {
  return UUID_RE.test(String(value || "").trim());
}

function parseJsonBodyLength(req: NextRequest): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const out = Number(raw);
  return Number.isFinite(out) ? Math.max(0, Math.floor(out)) : 0;
}

function pgErrorCode(e: unknown): string {
  if (!e || typeof e !== "object") return "";
  return String((e as PgErrorLike).code || "").trim();
}

function pgErrorMessage(e: unknown): string {
  if (!e || typeof e !== "object") return "";
  return String((e as PgErrorLike).message || "").trim();
}

function isUniqueViolation(e: unknown): boolean {
  return pgErrorCode(e) === "23505";
}

function isLegacyAliasMetadataMissing(e: unknown): boolean {
  const msg = pgErrorMessage(e).toLowerCase();
  if (
    !msg.includes("column") ||
    (!msg.includes("expires_at") && !msg.includes("revoked_at") && !msg.includes("is_active"))
  ) {
    return false;
  }
  const code = pgErrorCode(e);
  return !code || code === "42703";
}

export async function POST(req: NextRequest) {
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_API_V1_ALIASES_MS", 15_000);
  try {
    return await withRequestTelemetry(
      req,
      () => withRouteTimeout(
        (async () => {
        const ipInfo = clientIpKey(req);
        const rl = await enforceGlobalApiRateLimit({
          req,
          scope: "ip:api",
          limit: Number(process.env.RATE_LIMIT_API_IP_PER_MIN || 240),
          windowSeconds: 60,
          strict: true,
        });
        if (!rl.ok) {
          return NextResponse.json(
            { ok: false, error: "RATE_LIMIT" },
            { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
          );
        }
        if (parseJsonBodyLength(req) > MAX_ALIASES_BODY_BYTES) {
          return NextResponse.json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
        }

        const auth = await verifyApiKeyFromRequest(req);
        if (!auth.ok) {
          return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
        }

        let body: Record<string, unknown> | null = null;
        try {
          const parsed = await req.json();
          body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
        } catch {
          return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
        }
        if (!body) {
          return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
        }

        const docId = String(body?.doc_id || body?.docId || "").trim();
        const alias = String(body?.alias || "").trim();
        const expiresDaysRaw = Number(body?.expires_days ?? body?.expiresDays ?? process.env.ALIAS_DEFAULT_TTL_DAYS ?? 30);
        const expiresDays = Number.isFinite(expiresDaysRaw)
          ? Math.max(MIN_ALIAS_TTL_DAYS, Math.min(MAX_ALIAS_TTL_DAYS, Math.floor(expiresDaysRaw)))
          : 30;
        if (!docId) return NextResponse.json({ ok: false, error: "MISSING_DOC_ID" }, { status: 400 });
        if (!isUuid(docId)) return NextResponse.json({ ok: false, error: "INVALID_DOC_ID" }, { status: 400 });
        if (!alias) return NextResponse.json({ ok: false, error: "MISSING_ALIAS" }, { status: 400 });
        if (!/^[a-zA-Z0-9_-]{3,80}$/.test(alias)) {
          return NextResponse.json({ ok: false, error: "INVALID_ALIAS" }, { status: 400 });
        }

        const owns = (await sql`
          select 1
          from public.docs
          where id = ${docId}::uuid
            and owner_id = ${auth.ownerId}::uuid
          limit 1
        `) as unknown as Array<{ "?column?": number }>;
        if (!owns.length) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

        let created: Array<{ alias: string }> = [];
        try {
          created = (await sql`
            insert into public.doc_aliases (alias, doc_id, is_active, expires_at, revoked_at)
            values (${alias}, ${docId}::uuid, true, now() + (${expiresDays}::int * interval '1 day'), null)
            returning alias::text as alias
          `) as unknown as Array<{ alias: string }>;
        } catch (e: unknown) {
          if (isLegacyAliasMetadataMissing(e)) {
            try {
              created = (await sql`
                insert into public.doc_aliases (alias, doc_id)
                values (${alias}, ${docId}::uuid)
                returning alias::text as alias
              `) as unknown as Array<{ alias: string }>;
            } catch (legacyInsertError: unknown) {
              if (isUniqueViolation(legacyInsertError)) {
                return NextResponse.json({ ok: false, error: "ALIAS_TAKEN" }, { status: 409 });
              }
              await logDbErrorEvent({
                scope: "api_v1_aliases",
                message: "alias_create_legacy_insert_failed",
                ip: ipInfo.ip,
                actorUserId: auth.ownerId,
                meta: {
                  route: "/api/v1/aliases",
                  code: pgErrorCode(legacyInsertError) || null,
                },
              });
              return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
            }
            if (!created.length) {
              return NextResponse.json({ ok: false, error: "ALIAS_TAKEN" }, { status: 409 });
            }
            return NextResponse.json({ ok: true, alias: created[0].alias, doc_id: docId });
          }
          if (isUniqueViolation(e)) {
            return NextResponse.json({ ok: false, error: "ALIAS_TAKEN" }, { status: 409 });
          }
          await logDbErrorEvent({
            scope: "api_v1_aliases",
            message: "alias_create_failed",
            ip: ipInfo.ip,
            actorUserId: auth.ownerId,
            meta: { route: "/api/v1/aliases", code: pgErrorCode(e) || null },
          });
          return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
        }
        if (!created.length) {
          return NextResponse.json({ ok: false, error: "ALIAS_TAKEN" }, { status: 409 });
        }
        const createdAlias = created[0].alias;

        emitWebhook("alias.created", { alias: createdAlias, doc_id: docId, created_via: "api" });
        await appendImmutableAudit(
          {
            streamKey: `doc:${docId}`,
            action: "doc.alias_created",
            actorUserId: auth.ownerId,
            docId,
            subjectId: createdAlias,
            ipHash: ipInfo.ipHash,
            payload: {
              alias: createdAlias,
              via: "api",
            },
          },
          { strict: true }
        );

        return NextResponse.json({ ok: true, alias: createdAlias, doc_id: docId });
        })(),
        timeoutMs
      ),
      { routeKey: "/api/v1/aliases" }
    );
  } catch (e: unknown) {
    if (isRouteTimeoutError(e)) {
      return NextResponse.json({ ok: false, error: "TIMEOUT" }, { status: 504 });
    }
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
