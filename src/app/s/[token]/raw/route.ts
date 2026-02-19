import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, r2Bucket } from "@/lib/r2";
import { hmacSha256Hex } from "@/lib/crypto";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * We only redirect to password gate when this is a browser navigation
 * requesting HTML.
 *
 * When the embedded PDF viewer fetches the PDF, Accept is usually
 * application/pdf or * / * (not text/html), so we keep serving the PDF normally.
 */
function shouldRedirectToGate(req: NextRequest): boolean {
  const accept = (req.headers.get("accept") || "").toLowerCase();
  return accept.includes("text/html");
}

function gateCookieName(token: string) {
  return `s_gate_${hmacSha256Hex(token).slice(0, 16)}`;
}

async function getObjectStream(key: string) {
  const out = await r2Client.send(
    new GetObjectCommand({
      Bucket: r2Bucket,
      Key: key,
    })
  );

  if (!out.Body) {
    throw new Error("Missing object body from R2");
  }

  return out.Body as any;
}

type ShareLookupRow = {
  doc_id: string;
  r2_key: string;
  password_hash: string | null;
  expires_at: string | null;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const rows = (await sql`
    select
      s.doc_id::text as doc_id,
      d.r2_key::text as r2_key,
      s.password_hash::text as password_hash,
      s.expires_at::text as expires_at
    from doc_shares s
    join docs d on d.id = s.doc_id
    where s.token = ${token}
    limit 1
  `) as unknown as ShareLookupRow[];

  const share = rows[0];
  if (!share) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return new NextResponse("Link expired", { status: 410 });
  }

  const cookieName = gateCookieName(token);
  const cookieJar = await cookies();
  const hasGateCookie = cookieJar.get(cookieName);

  if (share.password_hash && !hasGateCookie) {
    if (shouldRedirectToGate(req)) {
      const url = new URL(`/s/${token}`, req.url);
      return NextResponse.redirect(url);
    }

    return new NextResponse("Unauthorized", { status: 401 });
  }

  const body = await getObjectStream(share.r2_key);

  return new NextResponse(body as any, {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
    },
  });
}
