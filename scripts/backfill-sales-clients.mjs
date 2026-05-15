/**
 * Backfill: for every submitted /sales form_session that doesn't already have
 * its own dedicated client (matched by form_session_token), create one using
 * the same logic as the new submit path. Also re-link any "Website Build —
 * {business_name}" tasks that point at the merged rep client → the new client.
 *
 * Usage:
 *   node scripts/backfill-sales-clients.mjs           # dry run, prints what it would do
 *   node scripts/backfill-sales-clients.mjs --apply   # actually writes
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { createHash, randomInt } from "node:crypto";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const APPLY = process.argv.includes("--apply");
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Mirrors lib/pin.ts (sha256, no salt)
function generatePin() {
  return String(randomInt(100000, 999999));
}
function hashPin(pin) {
  return createHash("sha256").update(pin).digest("hex");
}

function slugify(s) {
  return (s || "client")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function main() {
  console.log(APPLY ? "🟢 APPLY MODE — writes will happen.\n" : "🟡 DRY RUN — no writes. Add --apply to commit.\n");

  // Pull all submitted sales sessions
  const { data: sessions, error: e1 } = await supabase
    .from("form_sessions")
    .select("token, form_data, sales_rep_id, submitted_at")
    .not("submitted_at", "is", null);
  if (e1) throw new Error(`Sessions query failed: ${e1.message}`);

  const salesSessions = (sessions || []).filter(
    (s) => (s.form_data?._source) === "sales",
  );

  if (salesSessions.length === 0) {
    console.log("No sales submissions found.");
    return;
  }

  let createdClients = 0;
  let relinkedTasks = 0;
  let skipped = 0;

  for (const s of salesSessions) {
    const fd = s.form_data || {};
    const businessName = fd.business_name || "Unknown";
    const tokenShort = s.token.slice(0, 8);

    // Already has a dedicated client?
    const { data: existing } = await supabase
      .from("clients")
      .select("id")
      .eq("form_session_token", s.token)
      .maybeSingle();
    if (existing) {
      console.log(`✓ ${businessName} (${tokenShort}): already has client ${existing.id.slice(0, 8)}`);
      skipped++;
      continue;
    }

    // Build the new client payload
    const businessEmail = fd.email && String(fd.email).includes("@") ? fd.email : null;
    const syntheticEmail = `nomail-${slugify(businessName)}-${tokenShort}@websitereveals.local`;
    const email = businessEmail || syntheticEmail;
    const businessPhone = fd.phone || fd.contact_phone || null;

    console.log(`+ ${businessName} (${tokenShort}): would create client with email=${email}`);

    if (APPLY) {
      const pin = generatePin();
      const pin_hash = hashPin(pin);
      let { data: newClient, error: insErr } = await supabase
        .from("clients")
        .insert({
          first_name: businessName,
          last_name: "",
          company_name: businessName,
          email,
          phone: businessPhone,
          website_url: fd.current_website || null,
          form_session_token: s.token,
          sales_rep_id: s.sales_rep_id || null,
          pin,
          pin_hash,
        })
        .select("id")
        .single();

      if (insErr) {
        // Likely email constraint collision — retry with synthetic
        if (String(insErr.message).toLowerCase().includes("duplicate") && email !== syntheticEmail) {
          const retry = await supabase
            .from("clients")
            .insert({
              first_name: businessName,
              last_name: "",
              company_name: businessName,
              email: syntheticEmail,
              phone: businessPhone,
              website_url: fd.current_website || null,
              form_session_token: s.token,
              sales_rep_id: s.sales_rep_id || null,
              pin,
              pin_hash,
            })
            .select("id")
            .single();
          if (retry.error) {
            console.error(`  ❌ retry insert failed: ${retry.error.message}`);
            continue;
          }
          newClient = retry.data;
        } else {
          console.error(`  ❌ insert failed: ${insErr.message}`);
          continue;
        }
      }
      createdClients++;

      // Re-link tasks: find tasks whose title contains the business_name AND
      // whose current client isn't the new one we just created.
      const { data: tasksToMove } = await supabase
        .from("tasks")
        .select("id, client_id, title")
        .ilike("title", `%${businessName}%`)
        .neq("client_id", newClient.id);

      if (tasksToMove && tasksToMove.length > 0) {
        for (const t of tasksToMove) {
          const { error: upd } = await supabase
            .from("tasks")
            .update({ client_id: newClient.id, updated_at: new Date().toISOString() })
            .eq("id", t.id);
          if (upd) {
            console.error(`  ❌ task relink ${t.id}: ${upd.message}`);
          } else {
            console.log(`    ↪ relinked task ${t.id.slice(0, 8)} (${t.title})`);
            relinkedTasks++;
          }
        }
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Sales sessions scanned: ${salesSessions.length}`);
  console.log(`Already had a client:   ${skipped}`);
  console.log(`Clients ${APPLY ? "created" : "would create"}: ${APPLY ? createdClients : salesSessions.length - skipped}`);
  if (APPLY) console.log(`Tasks relinked:         ${relinkedTasks}`);
  if (!APPLY) console.log(`\nRun again with --apply to commit.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
