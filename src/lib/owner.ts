import "server-only";
import { verifySignedPayload } from "@/lib/crypto";
import { sql } from "@/lib/db";

type DocSession = { grant_id: number; exp: number };

function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  header.split(";").forEach((part) => {
    const [k, ...rest] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(rest.join("=") || "");
  });
  return out;
}

export async function requireOwnerFromGrantSession(req: Request) {
  const owner = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
  // 404 instead of 401/403 so it doesn't advertise an admin surface
  if (!owner) throw new Response("Not found", { status: 404 });

  const cookieHeader = req.headers.get("cookie") || "";
  const jar = parseCookieHeader(cookieHeader);
  const raw = jar["cy_doc_session"];
  if (!raw) throw new Response("Not found", { status: 404 });

  const sess = verifySignedPayload<DocSession>(raw);
  if (!sess) throw new Response("Not found", { status: 404 });

  if (!sess.exp || sess.exp * 1000 < Date.now()) {
    throw new Response("Not found", { status: 404 });
  }

  const rows = await sql<{ principal: string }[]>`
    select principal
    from doc_access_grants
    where id = ${sess.grant_id}
      and revoked_at is null
    limit 1
  `;

  const principal = rows[0]?.principal?.trim().toLowerCase();
  if (!principal || principal !== owner) throw new Response("Not found", { status: 404 });

  return { principal, grant_id: sess.grant_id };
}
