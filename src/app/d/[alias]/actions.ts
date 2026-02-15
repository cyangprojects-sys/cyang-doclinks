"use server";

import { z } from "zod";
import { sql } from "@/lib/db";
import { requireOwner } from "@/lib/owner";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ShareInput = z.object({
  docId: z.string().uuid(),
  email: z.string().email(),
});

type ShareOk = { ok: true };
type ShareErr = { ok: false; error: string; message?: string };

function publicBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export async function shareDocToEmail(input: unknown): Promise<ShareOk | ShareErr> {
  const owner = await requireOwner();
  if (!owner.ok) {
    return { ok: false, error: owner.reason, message: "Not authorized." };
  }

  const parsed = ShareInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "BAD_REQUEST", message: "Invalid input." };
  }

  const { docId, email } = parsed.data;

  // Ensure doc exists (and isn't deleted)
  const docs = (await sql`
    select id::text as id, title
    from public.docs
    where id = ${docId}::uuid
      and coalesce(status, '') <> 'deleted'
    limit 1
  `) as { id: string; title: string | null }[];

  if (!docs.length) {
    return { ok: false, error: "NOT_FOUND", message: "Document not found." };
  }

  const title = docs[0].title || "Shared document";
  const link = `${publicBaseUrl()}/serve/${encodeURIComponent(docId)}`;

  try {
    await sendEmail({
      to: email,
      subject: `Shared: ${title}`,
      html: `
        <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
          <h2 style="margin:0 0 12px 0;">${escapeHtml(title)}</h2>
          <p style="margin:0 0 12px 0;">A document has been shared with you.</p>
          <p style="margin:0 0 12px 0;">
            <a href="${link}">Open document</a>
          </p>
          <p style="color:#666; font-size:12px; margin:16px 0 0 0;">
            If you didn't expect this, you can ignore this email.
          </p>
        </div>
      `,
    });
  } catch (err: any) {
    return { ok: false, error: "EMAIL_FAILED", message: err?.message ?? "Email failed." };
  }

  return { ok: true };
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
