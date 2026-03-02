import { sql } from "@/lib/db";

export async function runUsageMaintenance(): Promise<{
  seededCurrentMonth: number;
  deletedOldDailyRows: number;
}> {
  try {
    const seedRows = (await sql`
      with prior as (
        select distinct um.user_id
        from public.user_usage_monthly um
        where um.month = date_trunc('month', now() - interval '1 month')::date
      ),
      ins as (
        insert into public.user_usage_monthly (user_id, month, view_count, upload_count)
        select p.user_id, date_trunc('month', now())::date, 0, 0
        from prior p
        on conflict (user_id, month) do nothing
        returning user_id
      )
      select count(*)::int as c from ins
    `) as unknown as Array<{ c: number }>;

    const dailyRows = (await sql`
      with del as (
        delete from public.user_usage_daily
        where day < ((now() at time zone 'utc')::date - interval '120 day')
        returning 1
      )
      select count(*)::int as c from del
    `) as unknown as Array<{ c: number }>;

    return {
      seededCurrentMonth: Number(seedRows?.[0]?.c ?? 0),
      deletedOldDailyRows: Number(dailyRows?.[0]?.c ?? 0),
    };
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "code" in e && String((e as { code?: string }).code || "") === "42P01") {
      return { seededCurrentMonth: 0, deletedOldDailyRows: 0 };
    }
    throw e;
  }
}
