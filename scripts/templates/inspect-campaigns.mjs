/**
 * Read-only inspection of tpl_campaigns ahead of the single-state migration.
 * Reports: total campaigns, per-campaign location states, multi-state campaigns,
 * and duplicate (industry_slug, state) pairs that would break a UNIQUE constraint.
 *
 * Usage: node scripts/templates/inspect-campaigns.mjs
 */
import { readFileSync, existsSync } from "node:fs";
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
  env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || env.DATABASE_URL || env.SUPABASE_DB_URL;
if (!conn) {
  console.error("No Postgres connection string found in env.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const { rows } = await client.query(
    `select id, industry_slug, locations, target_count, status, scraped_count
       from tpl_campaigns
       order by industry_slug, created_at`,
  );
  console.log(`Total campaigns: ${rows.length}\n`);

  const stateOf = (locs) => {
    const states = [
      ...new Set(
        (Array.isArray(locs) ? locs : [])
          .map((l) => (l?.state ?? "").trim().toUpperCase())
          .filter(Boolean),
      ),
    ];
    return states;
  };

  const pairCount = new Map();
  for (const r of rows) {
    const states = stateOf(r.locations);
    const multi = states.length > 1 ? "  ⚠ MULTI-STATE" : "";
    console.log(
      `${r.industry_slug.padEnd(20)} states=[${states.join(",") || "—"}] ` +
        `status=${r.status} scraped=${r.scraped_count ?? 0} id=${r.id}${multi}`,
    );
    for (const s of states) {
      const key = `${r.industry_slug}::${s}`;
      pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
    }
  }

  const dupes = [...pairCount.entries()].filter(([, n]) => n > 1);
  console.log(`\nDuplicate (industry_slug, state) pairs: ${dupes.length}`);
  for (const [key, n] of dupes) console.log(`  ${key} -> ${n} campaigns`);

  const multiState = rows.filter((r) => stateOf(r.locations).length > 1);
  console.log(`\nMulti-state campaigns: ${multiState.length}`);
  for (const r of multiState) console.log(`  ${r.industry_slug} ${r.id} states=[${stateOf(r.locations).join(",")}]`);

  const noState = rows.filter((r) => stateOf(r.locations).length === 0);
  console.log(`\nCampaigns with no resolvable state: ${noState.length}`);
  for (const r of noState) console.log(`  ${r.industry_slug} ${r.id} locations=${JSON.stringify(r.locations)}`);
} catch (err) {
  console.error("Inspection failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
