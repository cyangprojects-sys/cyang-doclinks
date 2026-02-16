// src/app/s/[token]/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import crypto from "crypto";
import { sql } from "@/lib/db";

type ShareRow = {
    id: string;
    doc_id: string;
    token: string;
    expires_at: string | null;
    max_views: number | null;
    view_count: number;
    revoked_at: string | null;
    alias: string;
    doc_title: string | null;
};

function sha256Hex(input: string) {
    return crypto.createHash("sha256").update(input).digest("hex");
}

export default async function ShareTokenPage({
    params,
}: {
    params: { token: string };
}) {
    const token = params.token;

    // 1) Load share + resolve alias + title
    const rows = (await sql`
    select
      s.id::text as id,
      s.doc_id::text as doc_id,
      s.token,
      s.expires_at::text as expires_at,
      s.max_views,
      s.view_count,
      s.revoked_at::text as revoked_at,
      a.alias as alias,
      d.title as doc_title
    from doc_shares s
    join docs d on d.id = s.doc_id
    join doc_aliases a on a.doc_id = s.doc_id
    where s.token = ${token}
    limit 1
  `) as unknown as ShareRow[];

    if (!rows?.length) {
        return renderDenied("This share link is invalid.");
    }

    const s = rows[0];

    if (s.revoked_at) {
        return renderDenied("This share link has been revoked.");
    }

    const now = Date.now();
    if (s.expires_at) {
        const exp = Date.parse(s.expires_at);
        if (Number.isFinite(exp) && now > exp) {
            return renderDenied("This share link has expired.");
        }
    }

    // NOTE:
    // We do NOT increment view_count here anymore.
    // Raw download route is the source of truth for view counting & max_views enforcement.

    // Optional: lightweight click log (best-effort)
    try {
        const h = await headers();
        const ip =
            h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            h.get("x-real-ip") ||
            "";
        const ua = h.get("user-agent") || "";

        const ipHash = ip ? sha256Hex(ip) : null;

        await sql`
      insert into doc_share_views (share_id, ip_hash, user_agent)
      values (${s.id}::uuid, ${ipHash}, ${ua})
    `;
    } catch {
        // ignore logging failures
    }

    // 3) Set cookie so /d/[alias]/raw can authorize without token in URL
    const cookieStore = await cookies();
    cookieStore.set("cyang_share", token, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        // Let cookie live up to expiration if present; otherwise 7 days
        maxAge: s.expires_at
            ? Math.max(60, Math.floor((Date.parse(s.expires_at) - now) / 1000))
            : 60 * 60 * 24 * 7,
    });

    redirect(`/d/${encodeURIComponent(s.alias)}`);
}

function renderDenied(message: string) {
    return (
        <div style={{ padding: 24, fontFamily: "system-ui,Segoe UI,Roboto,Arial" }}>
            <div style={{ maxWidth: 640, margin: "0 auto" }}>
                <h1 style={{ fontSize: 22, margin: "0 0 10px 0" }}>Access denied</h1>
                <p style={{ margin: 0, color: "#374151", lineHeight: "22px" }}>
                    {message}
                </p>
            </div>
        </div>
    );
}
