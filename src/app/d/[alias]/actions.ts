"use server";

import { z } from "zod";
import { sendMail } from "@/lib/email";

const ShareInput = z.object({
  docId: z.string().min(1),
  email: z.string().email(),
  alias: z.string().min(1).optional(),
});

export type ShareResult =
  | { ok: true }
  | { ok: false; error: string; message?: string };

function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://www.cyang.io";
}

/**
 * IMPORTANT:
 * In a "use server" file, only async functions may be exported.
 */
export async function shareDocToEmail(input: {
  docId: string;
  email: string;
  alias?: string;
}): Promise<ShareResult> {
  try {
    const parsed = ShareInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: "bad_request",
        message: parsed.error.message,
      };
    }

    const { docId, email, alias } = parsed.data;

    const url = alias
      ? `${getBaseUrl()}/d/${encodeURIComponent(alias)}`
      : `${getBaseUrl()}/serve/${encodeURIComponent(docId)}`;

    await sendMail({
      to: email,
      subject: "Your Cyang Docs link",
      text: `Here is your link:\n\n${url}`,
      html: `<p>Here is your link:</p><p><a href="${url}">${url}</a></p>`,
    });

    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      error: "internal_error",
      message: err?.message || "Unknown error",
    };
  }
}
