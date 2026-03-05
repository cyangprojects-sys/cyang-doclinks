import { sql } from "@/lib/db";
import crypto from "crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ALIAS_LEN = 60;

function normalizeUuidOrNull(value: unknown): string | null {
    const s = String(value || "").trim();
    if (!s) return null;
    return UUID_RE.test(s) ? s : null;
}

export function slugify(input: string): string {
    const base = (input || "")
        .toLowerCase()
        .trim()
        .replace(/['"]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    // keep it sane
    return base || "doc";
}

/**
 * Creates a unique alias in document_aliases for a doc.
 * - tries base
 * - then base-2, base-3, ...
 */
export async function createUniqueAliasForDoc(args: {
    docId: string;
    base: string;
}): Promise<string> {
    const docId = normalizeUuidOrNull(args.docId);
    if (!docId) throw new Error("INVALID_DOC_ID");
    const base = slugify(args.base).slice(0, MAX_ALIAS_LEN); // cap length

    // try up to 50 variants
    for (let i = 0; i < 50; i++) {
        const candidate = (i === 0 ? base : `${base}-${i + 1}`).slice(0, MAX_ALIAS_LEN);

        const inserted = (await sql`
      insert into document_aliases (alias, doc_id, is_active)
      values (${candidate}, ${docId}::uuid, true)
      on conflict (alias) do nothing
      returning alias
    `) as { alias: string }[];

        if (inserted.length) return inserted[0].alias;
    }

    // fallback: unique-ish alias if a lot of collisions
    const fallback = `${base}-${crypto.randomBytes(4).toString("hex")}`.slice(0, MAX_ALIAS_LEN);
    const inserted = (await sql`
    insert into document_aliases (alias, doc_id, is_active)
    values (${fallback}, ${docId}::uuid, true)
    on conflict (alias) do nothing
    returning alias
  `) as { alias: string }[];

    if (inserted.length) return inserted[0].alias;

    // last resort
    return `${base}-${Date.now()}`.slice(0, MAX_ALIAS_LEN);
}
