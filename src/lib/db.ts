import { neon } from "@neondatabase/serverless";

let cachedSql: ReturnType<typeof neon> | null = null;

function getSql(): ReturnType<typeof neon> {
    if (cachedSql) return cachedSql;

    const url = process.env.DATABASE_URL;
    if (!url) {
        throw new Error("Missing DATABASE_URL");
    }

    cachedSql = neon(url);
    return cachedSql;
}

// Lazy DB init prevents build-time module evaluation from failing in CI
// when DATABASE_URL is intentionally not present.
export const sql: any = (...args: any[]) => (getSql() as any)(...args);
