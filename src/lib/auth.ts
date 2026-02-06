import "server-only";

import { verifySignedPayload } from "@/lib/crypto";
import { sql } from "@/lib/db";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE_NAME = "cy_doc_session";

export type SessionPayload = {
  exp: number;
  user_id?: string;
  email?: string;
};

export type CurrentUser = {
  id?: string;
  email: string;
};

function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  header.split(";").forEach((part) => {
    const [k, ...rest] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(rest.join("=") || "");
  });
  return out;
}

export async function getSessionPayloadFromRequest(req: Request | { headers: Headers }): Promise<SessionPayload | null> {
  const cookieHeader = req.headers.get("cookie") || "";
  const jar = parseCookieHeader(cookieHeader);
  const raw = jar[SESSION_COOKIE_NAME];
  if (!raw) return null;

  const payload = verifySignedPayload<SessionPayload>(raw);
  if (!payload) return null;

  if (typeof payload.exp !== "number") return null;
  if (payload.exp * 1000 < Date.now()) return null;

  return payload;
}

export async function getUserFromSession(req: Request): Promise<CurrentUser | null> {
  const payload = await getSessionPayloadFromRequest(req);
  if (!payload) return null;

  if (payload.email && typeof payload.email === "string") {
    return { id: payload.user_id, email: payload.email };
  }

  if (!payload.user_id) return null;

  const rows = await sql<{ id: string; email: string }[]>`
    select id, email from users where id = ${payload.user_id} limit 1
  `;
  if (!rows[0]) return null;

  return { id: rows[0].id, email: rows[0].email };
}

export async function requireUser(req: Request): Promise<CurrentUser> {
  const user = await getUserFromSession(req);
  if (!user) throw new Response("Unauthorized", { status: 401 });
  return user;
}

export async function requireOwner(req: Request): Promise<CurrentUser> {
  const user = await requireUser(req);

  const owner = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
  if (!owner) throw new Response("Not found", { status: 404 });

  if (user.email.trim().toLowerCase() !== owner) {
    throw new Response("Not found", { status: 404 });
  }

  return user;
}
