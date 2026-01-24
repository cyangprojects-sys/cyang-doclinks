// src/lib/auth.ts
import "server-only";

import { cookies } from "next/headers";
import { verifySignedPayload } from "@/lib/crypto";
import { sql } from "@/lib/db";

export const SESSION_COOKIE_NAME = "cy_doc_session";

export type SessionPayload = {
  exp: number;          // unix seconds
  user_id?: string;     // optional if you store email only
  email?: string;       // recommended to include
  // add more later: role, name, etc.
};

export type CurrentUser = {
  id?: string;
  email: string;
};

/**
 * Reads the raw cy_doc_session cookie from Next's cookies() (Server Components / Route Handlers).
 */
function getRawSessionCookieFromNextCookies(): string | null {
  return cookies().get(SESSION_COOKIE_NAME)?.value ?? null;
}

/**
 * Minimal cookie parser for when you want to pass Request explicitly.
 */
function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  header.split(";").forEach((part) => {
    const [k, ...rest] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(rest.join("=") || "");
  });
  return out;
}

/**
 * Optional session: returns null if missing/invalid/expired.
 * Use this when you want "logged-in OR not" behavior.
 */
export async function getSessionPayloadFromCookies(): Promise<SessionPayload | null> {
  const raw = getRawSessionCookieFromNextCookies();
  if (!raw) return null;

  const payload = verifySignedPayload<SessionPayload>(raw);
  if (!payload) return null;

  // Expiration check
  if (typeof payload.exp !== "number") return null;
  if (payload.exp * 1000 < Date.now()) return null;

  return payload;
}

/**
 * Same as above, but reads from a Request (useful in some route-handler patterns).
 * You can ignore this if you always use cookies().
 */
export async function getSessionPayloadFromRequest(req: Request): Promise<SessionPayload | null> {
  const header = req.headers.get("cookie") || "";
  const jar = parseCookieHeader(header);
  const raw = jar[SESSION_COOKIE_NAME];
  if (!raw) return null;

  const payload = verifySignedPayload<SessionPayload>(raw);
  if (!payload) return null;

  if (typeof payload.exp !== "number") return null;
  if (payload.exp * 1000 < Date.now()) return null;

  return payload;
}

/**
 * OPTIONAL user: returns null when not signed in.
 * If payload contains email, we return immediately.
 * If not, we fall back to DB lookup by user_id.
 */
export async function getUserFromSession(): Promise<CurrentUser | null> {
  const payload = await getSessionPayloadFromCookies();
  if (!payload) return null;

  if (payload.email && typeof payload.email === "string") {
    return { id: payload.user_id, email: payload.email };
  }

  // Optional DB lookup fallback
  if (!payload.user_id) return null;

  const rows = await sql<{ id: string; email: string }[]>`
    select id, email
    from users
    where id = ${payload.user_id}
    limit 1
  `;

  if (!rows[0]) return null;
  return { id: rows[0].id, email: rows[0].email };
}

/**
 * REQUIRED user: throws 401 if not signed in.
 * Use in any route that must be authenticated.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getUserFromSession();
  if (!user) throw new Response("Unauthorized", { status: 401 });
  return user;
}

/**
 * OWNER guardrail: throws 404 if not owner (or if OWNER_EMAIL missing).
 * Use in any privileged/admin/upload routes.
 */
export async function requireOwner(): Promise<CurrentUser> {
  const user = await requireUser();

  const owner = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
  if (!owner) throw new Response("Not found", { status: 404 });

  if (user.email.trim().toLowerCase() !== owner) {
    throw new Response("Not found", { status: 404 });
  }

  return user;
}
