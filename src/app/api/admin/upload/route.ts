export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { sql } from "@/lib/db";
import { putObjectToR2, R2_BUCKET } from "@/lib/r2";
import { requireOwnerFromGrantSession } from "@/lib/owner";

function sanitizeFilename(name: string) {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
}

export async function POST(req: Request) {
  // ✅ Grant-based OWNER guard
  await requireOwnerFromGrantSession(req);

  const form = await req.formData();
  const file = form.get("file");
  const title = String(form.get("title") || "").trim();

  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }

  const nameLower = (file.name || "").toLowerCase();
  const isPdf = file.type === "application/pdf" || nameLower.endsWith(".pdf");
  if (!isPdf) {
    return Response.json({ error: "Only PDFs are supported" }, { status: 400 });
  }

  const docId = crypto.randomUUID();
  const safeName = sanitizeFilename(file.name || "document.pdf");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const key = `docs/${docId}/${ts}-${safeName}`;

  const bytes = new Uint8Array(await file.arrayBuffer());

  // ✅ Upload to R2
  await putObjectToR2({
    key,
    contentType: "application/pdf",
    body: bytes,
  });

  // ✅ Save pointer to DB
  const pointer = `r2://${R2_BUCKET}/${key}`;

  // Assumes: documents(id uuid primary key, title text, target_url text)
  await sql`
    insert into documents (id, title, target_url)
    values (${docId}::uuid, ${title || safeName}, ${pointer})
    on conflict (id)
    do update set
      title = excluded.title,
      target_url = excluded.target_url
  `;

return Response.json({
  ok: true,
  doc_id: docId,
  pointer,
  view_url: `/d/${docId}`, // ✅ your app has this route
});

}
