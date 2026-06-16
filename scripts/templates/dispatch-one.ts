/**
 * Dispatch ONE template prospect to SiteLaunchr (the `wr-template` source).
 *
 * The campaign "push" (lib/templates/sl/push.ts) sends EVERY `qualified`
 * prospect in a campaign at once. This is the controlled single-prospect
 * equivalent for end-to-end testing: pick one prospect by source_id and fire
 * exactly it.
 *
 * Read-only by default — looks up the prospect, prints its stage + the brand
 * inputs SL will receive, and shows the EXACT /api/builds payload produced by
 * the real `toBuildPayload` (no mapper-logic drift) plus validation. Nothing is
 * sent. Pass --send to actually POST the build. Idempotent on external_id
 * (== source_id): SL dedups, so a re-send is safe.
 *
 * The SL template is chosen by `brief.industry` on SL's side — this script does
 * NOT (cannot) name a template; confirm the industry→pest-control-bold mapping
 * in the sitelaunchr-builder repo before relying on the result.
 *
 * Usage:
 *   npx tsx scripts/templates/dispatch-one.ts wr-tpl-ChIJ-6bS2Db1UocRMN8YCC7DJIY
 *   npx tsx scripts/templates/dispatch-one.ts wr-tpl-... --send
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { toBuildPayload, validateBuildPayload } from "../../lib/templates/sl/toBuildPayload";
import type { CanonicalRecord } from "../../lib/templates/types";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, "")];
    }),
) as Record<string, string>;

async function main() {
  const args = process.argv.slice(2);
  const send = args.includes("--send");
  // --retry adds `retry: true`, which re-arms a terminally `failed` build in
  // place (same build_id) instead of getting the deduped {duplicate, failed}.
  // Use it to re-dispatch a build_failed lead after the underlying bug is fixed.
  const retry = args.includes("--retry");
  const sourceId = args.find((a) => !a.startsWith("--"));
  if (!sourceId) {
    console.error("Usage: npx tsx scripts/templates/dispatch-one.ts <source_id> [--send] [--retry]");
    process.exit(1);
  }

  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: row, error } = await db
    .from("tpl_prospects")
    .select("id, campaign_id, source_id, business_name, stage, confidence, completeness, record")
    .eq("source_id", sourceId)
    .maybeSingle();

  if (error) {
    console.error("DB error:", error.message);
    process.exit(1);
  }
  if (!row) {
    console.error(`No tpl_prospects row with source_id="${sourceId}"`);
    process.exit(1);
  }

  const record = (row.record ?? {}) as CanonicalRecord & Record<string, unknown>;
  const logo = record.logo as { src_url?: string } | undefined;

  console.log("\n=== Prospect ===");
  console.log(`  id:            ${row.id}`);
  console.log(`  campaign_id:   ${row.campaign_id}`);
  console.log(`  source_id:     ${row.source_id}`);
  console.log(`  business_name: ${row.business_name}`);
  console.log(`  stage:         ${row.stage}`);
  console.log(`  confidence:    ${row.confidence ?? "—"}`);
  console.log(`  industry_raw:  ${record.industry_raw ?? "—"}`);
  console.log(`  industry_slug: ${record.industry_slug ?? "—"}`);
  console.log(`  logo.src_url:  ${logo?.src_url ?? "— (none → Header/Footer fall back to business name)"}`);
  console.log(`  brand_colors:  ${JSON.stringify(record.brand_colors ?? null)}`);
  console.log(`  preview_url:   ${(record as { preview_url?: string }).preview_url ?? "— (set once SL callback reports the build live)"}`);
  console.log(`  build_error:   ${(record as { build_error?: string }).build_error ?? "—"}`);

  const payload = toBuildPayload(record);
  const valid = validateBuildPayload(payload);

  console.log("\n=== /api/builds payload (brief.industry decides the SL template) ===");
  console.log(JSON.stringify(payload, null, 2));
  console.log(`\n  validation: ${valid.ok ? "OK" : "MISSING " + valid.missing.join(", ")}`);
  console.log(
    `  → SL maps brief.industry="${payload.brief.industry}" to a template; confirm that resolves to "pest-control-bold" on the SL side.`,
  );

  if (!send) {
    console.log("\nDry run (no --send). Re-run with --send to dispatch to SL.\n");
    process.exit(valid.ok ? 0 : 1);
  }

  if (!valid.ok) {
    console.error("\nRefusing to send: payload failed validation.");
    process.exit(1);
  }

  const url = (env.SL_TEMPLATE_BUILD_URL || env.SITELAUNCHR_API_URL || "").trim();
  const apiKey = (env.SL_TEMPLATE_API_KEY || "").trim();
  const secret = (env.SL_TEMPLATE_HMAC_SECRET || "").trim();
  if (!url || !apiKey || !secret) {
    console.error(
      "\nMissing SL_TEMPLATE_BUILD_URL (or SITELAUNCHR_API_URL) / SL_TEMPLATE_API_KEY / SL_TEMPLATE_HMAC_SECRET in .env.local",
    );
    process.exit(1);
  }

  // Sign the exact bytes we send — same scheme as lib/sitelaunchr.ts signPayload
  // and lib/templates/sl/adapter.ts (HMAC-SHA256 of `${timestamp}.${rawBody}`).
  // With --retry, send `retry: true` to re-arm a terminally-failed build in place.
  const rawBody = JSON.stringify(retry ? { ...payload, retry: true } : payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");

  console.log(`\nDispatching to ${url} as source "wr-template"${retry ? " (retry: true — re-arm failed build)" : ""}...`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-source-id": "wr-template",
      "x-api-key": apiKey,
      "x-timestamp": timestamp,
      "x-signature": signature,
    },
    body: rawBody,
  });
  const text = await res.text();
  console.log(`SL responded: HTTP ${res.status}`);
  console.log(`Body: ${text}`);
  console.log(
    "\nSL callbacks (→ /api/templates/sl-callback) will drive the prospect stage building→live and populate preview_url.\n",
  );
  process.exit(res.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
