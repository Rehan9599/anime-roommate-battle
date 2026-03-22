import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const PG_HOST = process.env.PGHOST || process.env.PG_HOST || "127.0.0.1";
const PG_PORT = Number(process.env.PGPORT || process.env.PG_PORT || 5432);
const PG_DATABASE = process.env.PGDATABASE || process.env.PG_DATABASE || "anime_roommate_battle";
const PG_USER = process.env.PGUSER || process.env.PG_USER || "postgres";
const PG_PASSWORD = process.env.PGPASSWORD || process.env.PG_PASSWORD || "postgres";
const DATABASE_URL = process.env.DATABASE_URL || "";

async function main() {
  const pool = DATABASE_URL
    ? new Pool({ connectionString: DATABASE_URL })
    : new Pool({
        host: PG_HOST,
        port: PG_PORT,
        database: PG_DATABASE,
        user: PG_USER,
        password: PG_PASSWORD
      });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS arb_characters (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL
    )
  `);

  const raw = await readFile(new URL("../data/db.json", import.meta.url), "utf8");
  const parsed = JSON.parse(raw);
  const characters = Array.isArray(parsed?.characters) ? parsed.characters : [];

  for (const character of characters) {
    await pool.query(
      `
        INSERT INTO arb_characters (id, data)
        VALUES ($1, $2::jsonb)
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
      `,
      [character.id, JSON.stringify(character)]
    );
  }

  const countResult = await pool.query("SELECT COUNT(*)::int AS count FROM arb_characters");
  console.log(`Seed complete. Characters in DB: ${countResult.rows[0].count}`);

  await pool.end();
}

main().catch((err) => {
  console.error("Seeding failed:", err.message);
  process.exit(1);
});
