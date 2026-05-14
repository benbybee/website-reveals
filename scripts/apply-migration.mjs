/**
 * One-off migration runner — reads connection info from .env.vercel.pulled
 * (or .env.local fallback) and executes the SQL file passed as argv[2].
 *
 * Usage:  node scripts/apply-migration.mjs supabase/migrations/012_billing.sql
 *
 * Looks for a Postgres connection string under these names, in order:
 *   POSTGRES_URL_NON_POOLING  (preferred for DDL)
 *   POSTGRES_URL
 *   DATABASE_URL
 *   SUPABASE_DB_URL
 */
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import pg from "pg";

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const idx = l.indexOf("=");
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
}

const env = { ...loadEnvFile(".env.local"), ...loadEnvFile(".env.vercel.pulled") };

const conn =
  env.POSTGRES_URL_NON_POOLING ||
  env.POSTGRES_URL ||
  env.DATABASE_URL ||
  env.SUPABASE_DB_URL;

if (!conn) {
  console.error("No Postgres connection string found in env. Looking for POSTGRES_URL_NON_POOLING, POSTGRES_URL, DATABASE_URL, SUPABASE_DB_URL.");
  console.error("Available keys:", Object.keys(env).filter((k) => /POSTGRES|DATABASE|SUPABASE/.test(k)));
  process.exit(1);
}

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error("Usage: node scripts/apply-migration.mjs <path-to-sql>");
  process.exit(1);
}

const sql = readFileSync(sqlPath, "utf-8");

console.log(`Connecting to Postgres…`);
const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log(`Applying ${sqlPath}…`);
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log("✅ Migration applied successfully.");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("❌ Migration failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
