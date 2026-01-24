export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { cookies } from "next/headers";

import { r2, R2_BUCKET } from "@/lib/r2";
import { verifySignedPayload } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";

type DocSession = {
  grant_id: number;
  exp: number;
};

export async function POST(req: Request) {
  /* ------------------------------------------------------------------
     1) Validate cy_doc_session cookie
     ------------------------------------------------------------------ */
  const raw = cookies().get("cy_doc_session")?.value;
  if (!raw) return new Response("Not found", { status: 404 });

  const session = verifySignedPayload(raw) as DocSession | null;
  if (!session) return new Response("Not found", { status: 404 });

  if (session.exp <= Math.floor(Date.now() / 1000)) {
    return new Response("Not found", { status: 404 });
  }

  /* ------------------------------------------------------------------
     2) Resolve grant → email
     ------------------------------------------------------------------ */
  const grants = (await sql`
    select email, revoked_at, expires_at
    from doc_access_grants
    where id = ${session.grant_id}
    limit 1
  `) as { email: string; revoked_at: string | null; expires_at: string }[];

  if (!grants.length) return new Response("Not found", { status: 404 });

  const g = grants[0];
  if (g.revoked_at) return new Response("Not found", { status: 404 });
  if (new Date(g.expires_at).getTime() <= Date.now()) {
    return new Response("Not found", { status: 404 });
  }

  /* ------------------------------------------------------------------
     3) Admin check
     ------------------------------------------------------------------ */
  if (!isAdminEmail(g.email)) {
    // Deliberately 404, not 403
    return new Response("Not found", { status: 404 });
  }

  /* ------------------------------------------------------------------
     4) Parse request body
     ------------------------------------------------------------------ */
  const body = await req.json().catch(() => ({}));
  const filename = String(body.filename || "").trim();
  const contentType = String(body.contentType || "application/pdf").trim();

  if (!filename) {
    return new Response("Missing filename", { status: 400 });
  }

  const okTypes = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "text/plain",
  ]);
  if (!okTypes.has(contentType)) {
    return new Response("Bad contentType", { status: 400 });
  }

  /* ------------------------------------------------------------------
     5) Generate R2 presigned PUT URL
     ------------------------------------------------------------------ */
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `docs/${crypto.randomUUID()}_${safeName}`;

  const cmd = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(r2, cmd, {
    expiresIn: 60, // seconds
  });

  return NextResponse.json({
    uploadUrl,
    bucket: R2_BUCKET,
    key,
    r2Pointer: `r2://${R2_BUCKET}/${key}`,
  });
}
