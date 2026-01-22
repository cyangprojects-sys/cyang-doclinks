import postgres, { type Sql } from "postgres";

if (!process.env.DATABASE_URL) throw new Error("Missing DATABASE_URL");

// IMPORTANT: export a properly-typed Sql instance
export const sql: Sql = postgres(process.env.DATABASE_URL, { ssl: "require" });
