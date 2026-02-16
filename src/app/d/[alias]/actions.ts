"use server";

import { z } from "zod";
import { sql } from "@/lib/db";
import { sendMail } from "@/lib/email";
import { requireOwner } from "@/lib/auth";

const ShareInput = z.object({
  docId: z.string().min(1),
  email: z.string().email(),
  alias: z.string().min(1).optional(),
});

type DocRow = { title: string | null };

function getBaseUrl() {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) return site.replace(/\/+$/, "");
  return "https://www.cyang.io";
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function shareDocToEmail(input: unknown) {
  await requireOwner();

  const { docId, email, alias } = ShareInput.parse(input);

  // Fetch friendly title (best-effort)
  let title: string | null = null;
  try {
    const rows = (await sql`
      select title::text as title
      from public.docs
      where id = ${docId}::uuid
      limit 1
    `) as DocRow[];

    title = rows?.[0]?.title ?? null;
  } catch {
    // ignore
  }

  const base = getBaseUrl();

  const href = alias
    ? `${base}/d/${encodeURIComponent(alias)}`
    : `${base}/serve/${encodeURIComponent(docId)}`;

  const readableName = (title && title.trim()) || "Shared document";
  const linkLabel = alias ? `${readableName} (${alias})` : readableName;

  const subject = `Your Cyang Docs link: ${readableName}`;
  const text = `Here is your link:\n\n${href}\n`;

  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5;">
      <p style="margin:0 0 12px 0;">Here is your link:</p>
      <p style="margin:0 0 12px 0;">
        <a href="${escapeHtml(href)}" style="color:#2563eb; text-decoration:underline;">
          ${escapeHtml(linkLabel)}
        </a>
      </p>
      <p style="margin:12px 0 0 0; color:#6b7280; font-size:12px;">
        If the link above doesn’t work, copy/paste this URL:<br/>
        <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas;">
          ${escapeHtml(href)}
        </span>
      </p>
    </div>
  `;

  await sendMail({
    to: email,
    subject,
    text,
    html,
  });

  return { ok: true as const, sent_to: email };
}
