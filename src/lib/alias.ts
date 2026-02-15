import { sql } from "@/lib/db";

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
    const base = slugify(args.base).slice(0, 60); // cap length

    // try up to 50 variants
    for (let i = 0; i < 50; i++) {
        const candidate = i === 0 ? base : `${base}-${i + 1}`;

        const inserted = (await sql`
      insert into document_aliases (alias, doc_id, is_active)
      values (${candidate}, ${args.docId}::uuid, true)
      on conflict (alias) do nothing
      returning alias
    `) as { alias: string }[];

        if (inserted.length) return inserted[0].alias;
    }

    // fallback: unique-ish alias if a lot of collisions
    const fallback = `${base}-${Math.random().toString(36).slice(2, 8)}`;
    const inserted = (await sql`
    insert into document_aliases (alias, doc_id, is_active)
    values (${fallback}, ${args.docId}::uuid, true)
    on conflict (alias) do nothing
    returning alias
  `) as { alias: string }[];

    if (inserted.length) return inserted[0].alias;

    // last resort
    return `${base}-${Date.now()}`;
}
