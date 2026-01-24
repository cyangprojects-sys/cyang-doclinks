import { sql } from "@/lib/db";

export async function GET() {
  const rows = await sql`select 1 as ok`;
  return Response.json(rows);
}