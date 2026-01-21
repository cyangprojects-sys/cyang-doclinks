import "dotenv/config";
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL. Check your .env.local");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

const rows = await sql`
  select alias, is_active
  from document_aliases
  limit 20
`;

console.log(rows);

await sql.end({ timeout: 5 });
