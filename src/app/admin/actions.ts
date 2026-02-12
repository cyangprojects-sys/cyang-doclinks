"use server";

import crypto from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { r2Bucket, r2Client, r2Prefix } from "@/lib/r2";
import { sendMail } from "@/lib/email";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function appUrl() {
    return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

async function requireUserEmail(): Promise<string> {
    const session = await auth();
    const email = session?.user?.email;
    if (!email) throw new Error("Unauthorized.");
    return email;
}

function assertPdf(file: File) {
    const name = (file.name || "").toLowerCase();
    if (file.type !== "application/pdf" && !name.endsWith(".pdf")) {
        throw new Error("Only PDFs are allowed.");
    }
}

function cleanAlias(input: string) {
    const a = input.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(a)) {
        throw new Error(
            "Alias must be 3–64 chars: letters, numbers, _ or -, starting with a letter/number."
        );
    }
    return a;
}

function esc(s: string) {
    return s
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

export async function uploadPdfAction(formData: FormData) {
    const createdBy = await requireUserEmail();

    const title = String(formData.get("title") || "").trim();
    const file = formData.get("file") as unknown as File | null;

    if (!title) throw new Error("Title is required.");
    if (!file) throw new Error("PDF file is required.");
    assertPdf(file);

    const bytes = Buffer.from(await file.arrayBuffer());
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");

    const safeName = (file.name || "document.pdf").replace(/[^\w.\-]+/g, "_");
    const key = `${r2Prefix()}/${new Date().toISOString().slice(0, 10)}/${sha256}_${safeName}`;

    const bucket = r2Bucket();
    const client = r2Client();

    await client.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: bytes,
            ContentType: "application/pdf",
        })
    );

    const rows = (await sql`
    insert into docs (
      title,
      original_filename,
      content_type,
      byte_size,
      sha256_hex,
      r2_bucket,
      r2_key,
      created_by_email
    )
    values (
      ${title},
      ${file.name || safeName},
      ${"application/pdf"},
      ${bytes.length},
      ${sha256},
      ${bucket},
      ${key},
      ${createdBy}
    )
    returning id::text as id
  `) as unknown as { id: string }[];

    revalidatePath("/admin");
    redirect(`/admin?uploaded=1&doc=${encodeURIComponent(rows[0].id)}`);
}

export async function createOrAssignAliasAction(formData: FormData) {
    const createdBy = await requireUserEmail();

    const docId = String(formData.get("docId") || "").trim();
    const alias = cleanAlias(String(formData.get("alias") || ""));

    if (!docId) throw new Error("Missing docId.");

    const docCheck = (await sql`
    select id::text as id
    from docs
    where id = ${docId}::uuid
  `) as unknown as { id: string }[];

    if (docCheck.length === 0) throw new Error("Document not found.");

    const existing = (await sql`
    select alias, doc_id::text as doc_id
    from doc_aliases
    where alias = ${alias}
  `) as unknown as { alias: string; doc_id: string }[];

    if (existing.length > 0 && existing[0].doc_id !== docId) {
        throw new Error("Alias already in use for another document.");
    }

    await sql`
    insert into doc_aliases (alias, doc_id, created_by_email)
    values (${alias}, ${docId}::uuid, ${createdBy})
    on conflict (alias)
    do update set doc_id = excluded.doc_id
  `;

    revalidatePath("/admin");
    redirect(`/admin?aliased=1&alias=${encodeURIComponent(alias)}`);
}

export async function emailMagicLinkAction(formData: FormData) {
    const sentBy = await requireUserEmail();

    const docId = String(formData.get("docId") || "").trim();
    const alias = String(formData.get("alias") || "").trim().toLowerCase();
    const to = String(formData.get("to") || "").trim();
    const subject =
        String(formData.get("subject") || "").trim() || "Document link";

    if (!docId) throw new Error("Missing docId.");
    if (!alias) throw new Error("Alias is required before emailing.");
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
        throw new Error("Valid recipient email is required.");
    }

    const docRows = (await sql`
    select title from docs where id = ${docId}::uuid
  `) as unknown as { title: string }[];

    if (docRows.length === 0) throw new Error("Document not found.");

    const title = docRows[0].title;
    const link = `${appUrl()}/d/${alias}`;

    const text = `Here is your document link:\n\n${title}\n${link}\n`;
    const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
      <p>Here is your document link:</p>
      <p style="margin: 12px 0;"><strong>${esc(title)}</strong></p>
      <p><a href="${link}">${link}</a></p>
    </div>
  `;

    await sendMail({ to, subject, text, html });

    await sql`
    insert into doc_share_emails (doc_id, alias, recipient_email, subject, sent_by_email)
    values (${docId}::uuid, ${alias}, ${to}, ${subject}, ${sentBy})
  `;

    revalidatePath("/admin");
    redirect(`/admin?emailed=1&to=${encodeURIComponent(to)}`);
}
