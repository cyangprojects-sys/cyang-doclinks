"use server";

import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { r2Bucket, r2Client, r2Prefix } from "@/lib/r2";
import { sendMail } from "@/lib/email";

async function requireOwnerEmail(): Promise<string> {
    const session = await auth();
    const email = session?.user?.email || null;

    if (!email) throw new Error("Unauthorized.");

    const owner = (process.env.OWNER_EMAIL || "").toLowerCase();
    if (!owner) throw new Error("Missing OWNER_EMAIL");
    if (email.toLowerCase() !== owner) throw new Error("Forbidden.");

    return email;
}

function getBaseUrl() {
    const explicit = process.env.BASE_URL || process.env.NEXTAUTH_URL;
    if (explicit) return explicit.replace(/\/+$/, "");

    const vercel = process.env.VERCEL_URL;
    if (vercel) return `https://${vercel}`.replace(/\/+$/, "");

    return "http://localhost:3000";
}

async function resolveR2LocationForDoc(docId: string): Promise<{ bucket: string; key: string }> {
    // Attempt 1: docs.pointer = "r2://bucket/key"
    try {
        const rows = (await sql`
      select pointer
      from docs
      where id = ${docId}::uuid
      limit 1
    `) as unknown as Array<{ pointer: string | null }>;

        const pointer = rows[0]?.pointer ?? null;
        if (!pointer) throw new Error("Doc not found.");
        if (!pointer.startsWith(r2Prefix)) throw new Error("Invalid pointer.");
        const key = pointer.slice(r2Prefix.length);
        return { bucket: r2Bucket, key };
    } catch (e: any) {
        const msg = String(e?.message || "").toLowerCase();

        // If pointer column doesn't exist, fall back to r2_bucket/r2_key.
        // If doc not found, rethrow.
        const missingPointerCol = msg.includes("column") && msg.includes("pointer") && msg.includes("does not exist");
        if (!missingPointerCol) {
            // If it failed for some other reason (like doc not found), rethrow.
            throw e;
        }
    }

    // Attempt 2: docs.r2_bucket + docs.r2_key
    const rows2 = (await sql`
    select r2_bucket, r2_key
    from docs
    where id = ${docId}::uuid
    limit 1
  `) as unknown as Array<{ r2_bucket: string | null; r2_key: string | null }>;

    const r2b = rows2[0]?.r2_bucket ?? null;
    const r2k = rows2[0]?.r2_key ?? null;
    if (!r2b || !r2k) throw new Error("Doc not found.");
    return { bucket: r2b, key: r2k };
}

/**
 * Back-compat export expected by ./admin/page.tsx
 * Old flow uploaded server-side. New flow is direct-to-R2 signed URL at /admin/upload.
 */
export async function uploadPdfAction() {
    await requireOwnerEmail();
    throw new Error("uploadPdfAction is deprecated. Use /admin/upload instead.");
}

/**
 * Back-compat export expected by ./admin/page.tsx
 * Assumes a table: doc_aliases(alias text primary key, doc_id uuid not null)
 */
export async function createOrAssignAliasAction(formData: FormData) {
    await requireOwnerEmail();

    const alias = String(formData.get("alias") || "").trim();
    const docId = String(formData.get("docId") || formData.get("doc_id") || "").trim();

    if (!alias) throw new Error("Missing alias.");
    if (!docId) throw new Error("Missing docId.");
    if (!/^[a-zA-Z0-9_-]{3,80}$/.test(alias)) {
        throw new Error("Alias must be 3-80 chars: letters, numbers, underscore, dash.");
    }

    await sql`
    insert into doc_aliases (alias, doc_id)
    values (${alias}, ${docId}::uuid)
    on conflict (alias)
    do update set doc_id = excluded.doc_id
  `;

    revalidatePath("/admin");
    return { ok: true, alias, doc_id: docId };
}

/**
 * Back-compat export expected by ./admin/page.tsx
 */
export async function emailMagicLinkAction(formData: FormData) {
    const ownerEmail = await requireOwnerEmail();

    const to = String(formData.get("to") || formData.get("email") || formData.get("recipient") || "").trim();
    const docId = String(formData.get("docId") || formData.get("doc_id") || "").trim();
    const alias = String(formData.get("alias") || "").trim();

    if (!to) throw new Error("Missing recipient email.");
    if (!alias && !docId) throw new Error("Provide alias or docId.");

    const base = getBaseUrl();
    const token = alias || docId;
    const url = `${base}/d/${encodeURIComponent(token)}`;

    await sendMail({
        to,
        subject: "Your document link",
        text: `Here is your secure link:\n\n${url}\n\nIf you did not expect this message, you can ignore it.`,
    });

    await sendMail({
        to: ownerEmail,
        subject: "cyang.io: magic link emailed",
        text: `Sent link to ${to}\n\n${url}`,
    });

    revalidatePath("/admin");
    return { ok: true, to, url };
}

/**
 * Back-compat export expected by ./admin/page.tsx
 */
export async function deleteDocAction(formData: FormData) {
    await requireOwnerEmail();

    const docId = String(formData.get("docId") || formData.get("doc_id") || "").trim();
    if (!docId) throw new Error("Missing docId.");

    const { bucket, key } = await resolveR2LocationForDoc(docId);

    await r2Client.send(
        new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
        })
    );

    await sql`delete from docs where id = ${docId}::uuid`;

    // best-effort alias cleanup
    try {
        await sql`delete from doc_aliases where doc_id = ${docId}::uuid`;
    } catch {
        // ignore if table doesn't exist
    }

    revalidatePath("/admin");
    return { ok: true, doc_id: docId };
}
