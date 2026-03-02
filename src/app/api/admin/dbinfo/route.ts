export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/authz";

async function regclass(name: string) {
  const rows = (await sql`select to_regclass(${name})::text as reg`) as { reg: string | null }[];
  return rows?.[0]?.reg ?? null;
}

export async function GET() {
  await requireRole("admin");

  // NOTE: We intentionally do NOT return DATABASE_URL (would leak credentials).
  const infoRows = await sql`
    select
      current_database() as current_database,
      current_user as current_user,
      current_schema() as current_schema,
      current_setting('search_path') as search_path,
      inet_server_addr()::text as inet_server_addr,
      inet_server_port() as inet_server_port,
      version() as version
  `;

  const info = (infoRows as unknown as Array<Record<string, unknown>>)?.[0] ?? null;

  const tables = {
    "public.doc_audit": await regclass("public.doc_audit"),
    "public.doc_access_log": await regclass("public.doc_access_log"),
    "public.doc_views": await regclass("public.doc_views"),
    "public.docs": await regclass("public.docs"),
    "public.documents": await regclass("public.documents"),
  };

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    info,
    tables,
  });
}
