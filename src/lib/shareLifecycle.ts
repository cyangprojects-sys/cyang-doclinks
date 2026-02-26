import { sql } from "@/lib/db";

export async function revokeExpiredSharesBatch(limit: number = 1000): Promise<{ revoked: number }> {
  const n = Math.max(1, Math.min(5000, Number(limit || 1000)));
  try {
    const rows = (await sql`
      with targets as (
        select st.token
        from public.share_tokens st
        where st.revoked_at is null
          and st.expires_at is not null
          and st.expires_at <= now()
        order by st.expires_at asc
        limit ${n}::int
      )
      update public.share_tokens st
      set revoked_at = now()
      from targets t
      where st.token = t.token
      returning st.token
    `) as unknown as Array<{ token: string }>;
    return { revoked: rows.length };
  } catch (e: any) {
    if (String(e?.code || "") === "42P01") return { revoked: 0 };
    throw e;
  }
}

