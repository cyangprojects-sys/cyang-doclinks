import postgres, { type Sql } from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL");
}

// 👇 Explicitly type sql as Sql
export const sql: Sql = postgres(process.env.DATABASE_URL, {
  ssl: "require",
  max: 5,
});
