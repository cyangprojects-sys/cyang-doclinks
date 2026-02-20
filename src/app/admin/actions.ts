// src/app/admin/actions.ts
"use server";

import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

import { sql } from "@/lib/db";
import { r2Bucket, r2Client, r2Prefix } from "@/lib/r2";
import { sendMail } from "@/lib/email";
import { requireDocWrite, requireRole, requireUser } from "@/lib/authz";
import { setRetentionSettings } from "@/lib/settings";

function getBaseUrl() {
  const explicit = process.env.BASE_URL || process.env.NEXTAUTH_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`.replace(/\/+$/, "");

  return "http://localhost:3000";
}

async function requireShareWrite(token: string) {
  const t = String(token || "").trim();
  if (!t) throw new Error("Missing token.");

  const rows = (await sql`
    select doc_id::text as doc_id
    from public.share_tokens
    where token = ${t}
    limit 1
  `) as unknown as Array<{ doc_id: string }>;

  const docId = rows?.[0]?.doc_id ?? null;
  if (!docId) throw new Error("Token not found.");
  await requireDocWrite(docId);
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
    const missingPointerCol =
      msg.includes("column") && msg.includes("pointer") && msg.includes("does not exist");

    if (!missingPointerCol) throw e;
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

// Back-compat export expected by older admin UI
export async function uploadPdfAction(): Promise<void> {
  await requireRole("admin");
  throw new Error("uploadPdfAction is deprecated. Use /admin/upload instead.");
}

// Used as <form action={createOrAssignAliasAction}> — must return void
export async function createOrAssignAliasAction(formData: FormData): Promise<void> {
  const alias = String(formData.get("alias") || "").trim();
  const docId = String(formData.get("docId") || formData.get("doc_id") || "").trim();

  if (!alias) throw new Error("Missing alias.");
  if (!docId) throw new Error("Missing docId.");

  await requireDocWrite(docId);
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
  revalidatePath("/admin/dashboard");
}

// Used as <form action={emailMagicLinkAction}> — must return void
export async function emailMagicLinkAction(formData: FormData): Promise<void> {
  const u = await requireUser();

  const to = String(
    formData.get("to") || formData.get("email") || formData.get("recipient") || ""
  ).trim();

  const docId = String(formData.get("docId") || formData.get("doc_id") || "").trim();
  const alias = String(formData.get("alias") || "").trim();

  if (!to) throw new Error("Missing recipient email.");
  if (!alias && !docId) throw new Error("Provide alias or docId.");

  // AuthZ: verify ownership when docId/alias is provided.
  if (docId) {
    await requireDocWrite(docId);
  } else if (alias) {
    const rows = (await sql`
      select doc_id::text as doc_id
      from public.doc_aliases
      where lower(alias) = lower(${alias})
      limit 1
    `) as unknown as Array<{ doc_id: string }>;
    const did = rows?.[0]?.doc_id ?? null;
    if (!did) throw new Error("Alias not found.");
    await requireDocWrite(did);
  }

  const base = getBaseUrl();
  const token = alias || docId;
  const url = `${base}/d/${encodeURIComponent(token)}`;

  await sendMail({
    to,
    subject: "Your document link",
    text: `Here is your secure link:\n\n${url}\n\nIf you did not expect this message, you can ignore it.`,
  });

  // Optional audit
  await sendMail({
    to: u.email,
    subject: "cyang.io: link emailed",
    text: `Sent link to ${to}\n\n${url}`,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/dashboard");
}

// Retention settings (admin toggle)
export async function updateRetentionSettingsAction(formData: FormData): Promise<void> {
  await requireRole("admin");

  const enabledRaw = String(formData.get("retention_enabled") ?? "");
  const deleteExpiredRaw = String(formData.get("retention_delete_expired_shares") ?? "");
  const graceRaw = String(formData.get("retention_share_grace_days") ?? "");

  const enabled = enabledRaw === "on" || enabledRaw === "true" || enabledRaw === "1";
  const deleteExpiredShares = deleteExpiredRaw === "on" || deleteExpiredRaw === "true" || deleteExpiredRaw === "1";

  const graceNum = Number(graceRaw);
  const shareGraceDays = Number.isFinite(graceNum) ? Math.max(0, Math.floor(graceNum)) : 0;

  const res = await setRetentionSettings({ enabled, deleteExpiredShares, shareGraceDays });
  if (!res.ok) {
    throw new Error(`Failed to save retention settings: ${res.error}`);
  }

  revalidatePath("/admin/dashboard");
}

// Used as <form action={deleteDocAction}> — must return void
export async function deleteDocAction(formData: FormData): Promise<void> {
  const docId = String(formData.get("docId") || formData.get("doc_id") || "").trim();
  if (!docId) throw new Error("Missing docId.");

  await requireDocWrite(docId);

  const { bucket, key } = await resolveR2LocationForDoc(docId);

  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  await sql`delete from docs where id = ${docId}::uuid`;

  try {
    await sql`delete from doc_aliases where doc_id = ${docId}::uuid`;
  } catch {
    // ignore if table doesn't exist
  }

  revalidatePath("/admin");
  revalidatePath("/admin/dashboard");
}

/**
 * Share admin actions
 * Expected table: share_tokens(token text primary key, revoked_at timestamptz, password_hash text null, ...)
 */

// Used as <form action={revokeDocShareAction}>
export async function revokeDocShareAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") || "").trim();
  if (!token) throw new Error("Missing token.");

  await requireShareWrite(token);

  await sql`
    update share_tokens
    set revoked_at = now()
    where token = ${token}
      and revoked_at is null
  `;

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin");
}

// Used as <form action={setSharePasswordAction}>
export async function setSharePasswordAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") || "").trim();
  const password = String(formData.get("password") || "").trim();

  if (!token) throw new Error("Missing token.");
  if (password.length < 4) throw new Error("Password must be at least 4 characters.");

  await requireShareWrite(token);

  // bcrypt cost (12 is a good default for serverless)
  const hash = await bcrypt.hash(password, 12);

  await sql`
    update share_tokens
    set password_hash = ${hash}
    where token = ${token}
  `;

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin");
}

// Used as <form action={clearSharePasswordAction}>
export async function clearSharePasswordAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") || "").trim();
  if (!token) throw new Error("Missing token.");

  await requireShareWrite(token);

  await sql`
    update share_tokens
    set password_hash = null
    where token = ${token}
  `;

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin");
}

// --- Dashboard v2 actions (actionable + bulk) ---

export async function revokeAllSharesForDocAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const docId = String(formData.get("docId") || "").trim();
  if (!docId) throw new Error("Missing docId.");

  await sql`
    update public.share_tokens
    set revoked_at = now()
    where doc_id = ${docId}::uuid
      and revoked_at is null
  `;

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin");
  revalidatePath(`/admin/docs/${docId}`);
}

export async function disableAliasForDocAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const docId = String(formData.get("docId") || "").trim();
  if (!docId) throw new Error("Missing docId.");

  // Best-effort: prefer is_active=false if the column exists; fall back to revoked_at.
  try {
    await sql`
      update public.doc_aliases
      set is_active = false
      where doc_id = ${docId}::uuid
    `;
  } catch {
    try {
      await sql`
        update public.doc_aliases
        set revoked_at = now()
        where doc_id = ${docId}::uuid
          and revoked_at is null
      `;
    } catch {
      // last-resort: delete (older envs)
      await sql`
        delete from public.doc_aliases
        where doc_id = ${docId}::uuid
      `;
    }
  }

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin");
  revalidatePath(`/admin/docs/${docId}`);
}

export async function extendAliasExpirationAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const docId = String(formData.get("docId") || "").trim();
  const days = Number(formData.get("days") || 0);
  if (!docId) throw new Error("Missing docId.");
  if (!Number.isFinite(days) || days <= 0) throw new Error("Invalid days.");

  // Extend alias expiration (or set it) by +days from now.
  try {
    await sql`
      update public.doc_aliases
      set expires_at = greatest(coalesce(expires_at, now()), now()) + (${days}::int * interval '1 day')
      where doc_id = ${docId}::uuid
    `;
  } catch {
    // If the env doesn't have expires_at, ignore.
  }

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin");
  revalidatePath(`/admin/docs/${docId}`);
}

export async function extendShareExpirationAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const token = String(formData.get("token") || "").trim();
  const days = Number(formData.get("days") || 0);
  if (!token) throw new Error("Missing token.");
  if (!Number.isFinite(days) || days <= 0) throw new Error("Invalid days.");

  await sql`
    update public.share_tokens
    set expires_at = greatest(coalesce(expires_at, now()), now()) + (${days}::int * interval '1 day')
    where token = ${token}
  `;

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin");
}

export async function setShareMaxViewsAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const token = String(formData.get("token") || "").trim();
  const maxViewsRaw = String(formData.get("maxViews") || "").trim();
  if (!token) throw new Error("Missing token.");

  const maxViews = maxViewsRaw === "" ? null : Number(maxViewsRaw);
  if (maxViews !== null && (!Number.isFinite(maxViews) || maxViews < 0)) {
    throw new Error("Invalid maxViews.");
  }

  await sql`
    update public.share_tokens
    set max_views = ${maxViews}
    where token = ${token}
  `;

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin");
}

export async function resetShareViewsCountAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const token = String(formData.get("token") || "").trim();
  if (!token) throw new Error("Missing token.");

  await sql`
    update public.share_tokens
    set views_count = 0
    where token = ${token}
  `;

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin");
}

export async function forceSharePasswordResetAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const token = String(formData.get("token") || "").trim();
  if (!token) throw new Error("Missing token.");

  await sql`
    update public.share_tokens
    set password_hash = null
    where token = ${token}
  `;

  // Also invalidate existing unlocks (if table exists).
  try {
    await sql`delete from public.share_unlocks where token = ${token}`;
  } catch {
    // ignore
  }

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin");
}

export async function bulkRevokeSharesAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const raw = String(formData.get("tokens") || "").trim();
  if (!raw) throw new Error("Missing tokens.");
  const tokens = JSON.parse(raw) as string[];
  if (!Array.isArray(tokens) || tokens.length === 0) return;

  await sql`
    update public.share_tokens
    set revoked_at = now()
    where token = any(${tokens}::text[])
      and revoked_at is null
  `;

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin");
}

export async function bulkExtendSharesAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const raw = String(formData.get("tokens") || "").trim();
  const days = Number(formData.get("days") || 0);
  if (!raw) throw new Error("Missing tokens.");
  if (!Number.isFinite(days) || days <= 0) throw new Error("Invalid days.");
  const tokens = JSON.parse(raw) as string[];
  if (!Array.isArray(tokens) || tokens.length === 0) return;

  await sql`
    update public.share_tokens
    set expires_at = greatest(coalesce(expires_at, now()), now()) + (${days}::int * interval '1 day')
    where token = any(${tokens}::text[])
  `;

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin");
}

export async function bulkRevokeAllSharesForDocsAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const raw = String(formData.get("docIds") || "").trim();
  if (!raw) throw new Error("Missing docIds.");
  const docIds = JSON.parse(raw) as string[];
  if (!Array.isArray(docIds) || docIds.length === 0) return;

  await sql`
    update public.share_tokens
    set revoked_at = now()
    where doc_id = any(${docIds}::uuid[])
      and revoked_at is null
  `;

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin");
  for (const id of docIds) revalidatePath(`/admin/docs/${id}`);
}

export async function bulkDisableAliasesForDocsAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const raw = String(formData.get("docIds") || "").trim();
  if (!raw) throw new Error("Missing docIds.");
  const docIds = JSON.parse(raw) as string[];
  if (!Array.isArray(docIds) || docIds.length === 0) return;

  try {
    await sql`
      update public.doc_aliases
      set is_active = false
      where doc_id = any(${docIds}::uuid[])
    `;
  } catch {
    try {
      await sql`
        update public.doc_aliases
        set revoked_at = now()
        where doc_id = any(${docIds}::uuid[])
          and revoked_at is null
      `;
    } catch {
      await sql`
        delete from public.doc_aliases
        where doc_id = any(${docIds}::uuid[])
      `;
    }
  }

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin");
  for (const id of docIds) revalidatePath(`/admin/docs/${id}`);
}

// Expiration warning email (best-effort; uses doc_aliases.expires_at)
export async function sendExpirationAlertAction(formData: FormData): Promise<void> {
  const u = await requireRole("admin");

  const daysRaw = String(formData.get("days") || "3").trim();
  const daysNum = Number(daysRaw);
  const days = Number.isFinite(daysNum) ? Math.max(1, Math.min(30, Math.floor(daysNum))) : 3;

  const base = getBaseUrl();

  let rows: Array<{ doc_id: string; title: string | null; alias: string | null; expires_at: string | null }> = [];
  try {
    rows = (await sql`
      select
        d.id::text as doc_id,
        d.title,
        a.alias,
        a.expires_at::text as expires_at
      from public.doc_aliases a
      join public.docs d on d.id = a.doc_id
      where coalesce(a.is_active, true) = true
        and a.revoked_at is null
        and a.expires_at is not null
        and a.expires_at > now()
        and a.expires_at <= (now() + (${days}::int * interval '1 day'))
      order by a.expires_at asc
      limit 100
    `) as unknown as Array<{ doc_id: string; title: string | null; alias: string | null; expires_at: string | null }>;
  } catch {
    rows = [];
  }

  const lines = rows.map((r) => {
    const name = r.title || "Untitled";
    const docUrl = `${base}/admin/docs/${encodeURIComponent(r.doc_id)}`;
    const aliasUrl = r.alias ? `${base}/d/${encodeURIComponent(r.alias)}` : "";
    const exp = r.expires_at || "";
    return `- ${name} (${r.doc_id})\n  expires: ${exp}\n  admin: ${docUrl}${aliasUrl ? `\n  link: ${aliasUrl}` : ""}`;
  });

  const body =
    rows.length === 0
      ? `No aliases expiring in the next ${days} day(s).`
      : `Aliases expiring in the next ${days} day(s):\n\n${lines.join("\n\n")}`;

  await sendMail({
    to: u.email,
    subject: `cyang.io: expiring in ${days} day(s)`,
    text: body,
  });

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin");
}
