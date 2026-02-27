import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/rbac";
import { migrateLegacyEncryptionBatch } from "@/lib/encryptionMigration";
import { logSecurityEvent } from "@/lib/securityTelemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  limit: z.number().int().positive().max(250).optional(),
  dry_run: z.boolean().optional(),
  max_bytes: z.number().int().positive().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requirePermission("security.migrate_legacy");
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

    const result = await migrateLegacyEncryptionBatch({
      limit: parsed.data.limit ?? 25,
      dryRun: parsed.data.dry_run ?? false,
      maxBytes: parsed.data.max_bytes,
      actorUserId: user.id,
      orgId: user.orgId ?? null,
    });

    void logSecurityEvent({
      type: "legacy_encryption_migration",
      severity: "medium",
      actorUserId: user.id,
      orgId: user.orgId ?? null,
      scope: "crypto",
      message: "Legacy encryption migration batch executed",
      meta: {
        dryRun: parsed.data.dry_run ?? false,
        limit: parsed.data.limit ?? 25,
        scanned: result.scanned,
        migrated: result.migrated,
        skipped: result.skipped,
        failed: result.failed,
      },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "SERVER_ERROR";
    const status = msg === "FORBIDDEN" || msg === "UNAUTHENTICATED" ? 403 : 500;
    return NextResponse.json({ ok: false, error: status === 403 ? "FORBIDDEN" : "SERVER_ERROR" }, { status });
  }
}
