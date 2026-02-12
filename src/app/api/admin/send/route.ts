// src/app/api/admin/send/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { Resend } from "resend";

export async function POST(req: Request) {
    const session = await auth();
    const email = session?.user?.email?.toLowerCase().trim();
    const owner = (process.env.OWNER_EMAIL || "").toLowerCase().trim();

    if (!email || !owner || email !== owner) {
        return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const MAIL_FROM = process.env.MAIL_FROM;

    if (!RESEND_API_KEY || !MAIL_FROM) {
        return Response.json(
            {
                ok: false,
                error: "Email not configured. Set RESEND_API_KEY and MAIL_FROM env vars.",
            },
            { status: 500 }
        );
    }

    const body = await req.json().catch(() => null);
    const to = String(body?.to || "").trim();
    const subject = String(body?.subject || "").trim();
    const link = String(body?.link || "").trim();
    const message = String(body?.message || "").trim();

    if (!to || !subject || !link) {
        return Response.json(
            { ok: false, error: "to, subject, link are required." },
            { status: 400 }
        );
    }

    const base = process.env.NEXTAUTH_URL || "https://www.cyang.io";
    const url = link.startsWith("http") ? link : `${base}${link}`;

    const resend = new Resend(RESEND_API_KEY);

    await resend.emails.send({
        from: MAIL_FROM,
        to,
        subject,
        html: `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto;">
        <p>${escapeHtml(message || "Here’s the document link:")}</p>
        <p><a href="${url}">${url}</a></p>
      </div>
    `,
    });

    return Response.json({ ok: true });
}

function escapeHtml(s: string) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
