import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client } from "@/lib/r2";
import { consumeAccessTicket, signedUrlTtlSeconds } from "@/lib/accessTicket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const { ticketId } = await params;

  const consumed = await consumeAccessTicket({ req, ticketId });
  if (!consumed.ok) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const t = consumed.ticket;
  const signed = await getSignedUrl(
    r2Client,
    new GetObjectCommand({
      Bucket: t.r2_bucket,
      Key: t.r2_key,
      ResponseContentType: t.response_content_type,
      ResponseContentDisposition: t.response_content_disposition,
    }),
    { expiresIn: signedUrlTtlSeconds() }
  );

  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: signed,
      "Cache-Control": "private, no-store",
    },
  });
}
