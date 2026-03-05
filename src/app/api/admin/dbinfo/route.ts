export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/authz";
import { isDebugApiEnabled } from "@/lib/debugAccess";

async function regclass(name: string) {
  const rows = (await sql`select to_regclass(${name})::text as reg`) as { reg: string | null }[];
  return rows?.[0]?.reg ?? null;
}

export async function GET() {
  if (!isDebugApiEnabled()) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
  try {
    await requireRole("owner");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const tables = {
      "public.doc_audit": Boolean(await regclass("public.doc_audit")),
      "public.doc_access_log": Boolean(await regclass("public.doc_access_log")),
      "public.doc_views": Boolean(await regclass("public.doc_views")),
      "public.docs": Boolean(await regclass("public.docs")),
      "public.documents": Boolean(await regclass("public.documents")),
    };

    return NextResponse.json({
      ok: true,
      now: new Date().toISOString(),
      tables,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
