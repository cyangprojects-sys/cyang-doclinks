import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { r2Client } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  params: { alias: string };
};

export default async function AliasPage({ params }: Props) {
  const alias = decodeURIComponent(params.alias?.trim() || "");

  if (!alias) {
    notFound();
  }

  // 🔥 EXPLICITLY use public.doc_aliases
  const rows = await sql<{
    doc_id: string;
    revoked_at: string | null;
    expires_at: string | null;
  }[]>`
    select doc_id, revoked_at, expires_at
    from public.doc_aliases
    where alias = ${alias}
    limit 1
  `;

  if (!rows.length) {
    notFound();
  }

  const { doc_id, revoked_at, expires_at } = rows[0];

  if (revoked_at) {
    notFound();
  }

  if (expires_at && new Date(expires_at) < new Date()) {
    notFound();
  }

  const docRows = await sql<{
    r2_bucket: string;
    r2_key: string;
    content_type: string;
  }[]>`
    select r2_bucket, r2_key, content_type
    from public.docs
    where id = ${doc_id}::uuid
    limit 1
  `;

  if (!docRows.length) {
    notFound();
  }

  const { r2_bucket, r2_key, content_type } = docRows[0];

  const obj = await r2Client.send(
    new GetObjectCommand({
      Bucket: r2_bucket,
      Key: r2_key,
    })
  );

  const body = await obj.Body?.transformToByteArray();

  if (!body) {
    notFound();
  }

  return new Response(body, {
    headers: {
      "Content-Type": content_type || "application/pdf",
      "Content-Disposition": "inline",
    },
  });
}
