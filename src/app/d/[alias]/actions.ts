"use server";

import { sql } from "@/lib/db";
import { Resend } from "resend";

type Result = { ok: true } | { ok: false; error: string };

export async function shareDocToEmail(args: {
  docId: string;
  email: string;
}): Promise<Result> {
  const toEmail = (args.email || "").trim().toLowerCase();
  const docId = args.docId;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
    return { ok: false, error: "Invalid email." };
  }

  const rows = (await sql`
    insert into doc_shares (doc_id, to_email, expires_at)
    values (${docId}::uuid, ${toEmail}, now() + interval '14 days')
    returning token::text as token
  `) as { token: string }[];

  const token = rows?.[0]?.token;
  if (!token) return { ok: false, error: "Failed to create share token." };

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const url = `${baseUrl}/s/${token}`;

  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!resendKey || !from) {
    return { ok: false, error: "Missing RESEND_API_KEY or EMAIL_FROM env var." };
  }

  const resend = new Resend(resendKey);

  await resend.emails.send({
    from,
    to: toEmail,
    subject: "A document was shared with you",
    html: `
      <div style="font-family:ui-sans-serif,system-ui;line-height:1.5">
        <p>A document was shared with you.</p>
        <p><a href="${url}">Open the document</a></p>
        <p style="color:#666;font-size:12px">This link expires in 14 days.</p>
      </div>
    `,
  });

  return { ok: true };
}
