/**
 * Admin recovery tool: re-dispatch an orphaned /sales (or any) submission to
 * SiteLaunchr. Reads form_sessions[token], rebuilds the exact same payload
 * shape as lib/sitelaunchr-mapper.ts (no business logic drift), signs the
 * HMAC, POSTs to SL, and inserts the corresponding build_jobs row.
 *
 * Usage:
 *   node scripts/resubmit-sl.mjs <form_session_token>
 *   node scripts/resubmit-sl.mjs d8c339db                # 8-char prefix also works
 *   node scripts/resubmit-sl.mjs <token> --force         # ignore existing build_jobs row
 *
 * Refuses to run if a sitelaunchr build_jobs row already exists for the token,
 * unless --force is passed.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const args = process.argv.slice(2);
const force = args.includes("--force");
const tokenArg = args.find((a) => !a.startsWith("--"));
if (!tokenArg) {
  console.error("Usage: node scripts/resubmit-sl.mjs <form_session_token> [--force]");
  process.exit(1);
}

const SL_URL = (env.SITELAUNCHR_API_URL || "https://www.joinsitelaunchr.com/api/builds").trim();
const SL_KEY = (env.SITELAUNCHR_API_KEY || "").trim();
const SL_SECRET = (env.SITELAUNCHR_HMAC_SECRET || "").trim();
const CALLBACK = (env.SITELAUNCHR_CALLBACK_URL || "").trim();

if (!SL_KEY || !SL_SECRET) {
  console.error("Missing SITELAUNCHR_API_KEY or SITELAUNCHR_HMAC_SECRET in .env.local");
  process.exit(1);
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Resolve token (allow 8-char prefix for convenience)
// Note: form_sessions.token is a UUID column, so we have to fetch
// recently-submitted sessions and filter client-side rather than `LIKE`-match.
let token = tokenArg;
if (tokenArg.length < 36) {
  const { data: recent } = await supabase
    .from("form_sessions")
    .select("token, form_data")
    .not("submitted_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);
  const matches = (recent || []).filter((r) => String(r.token).startsWith(tokenArg));
  if (matches.length === 0) {
    console.error(`No recent submitted form_session matches prefix "${tokenArg}"`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(`Prefix "${tokenArg}" is ambiguous — matched ${matches.length} sessions. Use the full token.`);
    process.exit(1);
  }
  token = matches[0].token;
  console.log(`Resolved prefix "${tokenArg}" → ${token}`);
}

const { data: session, error } = await supabase
  .from("form_sessions")
  .select("token, form_data, sales_rep_id, submitted_at")
  .eq("token", token)
  .maybeSingle();

if (error || !session) {
  console.error("form_session not found:", token, error?.message);
  process.exit(1);
}

const fd = session.form_data || {};
const businessName = fd.business_name || "Unknown";
const contactEmail = fd.contact_email || fd.email;
const industry = fd.industry;
const isSales = fd._source === "sales";

const missing = [];
if (!fd.business_name) missing.push("business_name");
if (!contactEmail) missing.push("contact_email");
if (!industry) missing.push("industry");
if (missing.length > 0) {
  console.error(`form_session is missing required fields for SL: ${missing.join(", ")}`);
  process.exit(1);
}

// Check for existing build_jobs row
const { data: existing } = await supabase
  .from("build_jobs")
  .select("id, pipeline, sl_build_id, status, created_at")
  .eq("token", token)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (existing && existing.pipeline === "sitelaunchr" && !force) {
  console.error(
    `build_jobs row already exists for this token (id=${existing.id.slice(0, 8)}, ` +
      `sl_build_id=${(existing.sl_build_id || "").slice(0, 8)}, status=${existing.status}).`,
  );
  console.error("Pass --force to dispatch anyway (creates a second build_jobs row).");
  process.exit(1);
}

// Build brief — must stay in sync with lib/sitelaunchr-mapper.ts.
// Field-name translation: WR `current_url` → SL `domain_name`,
// WR `inspiration_sites` → SL `reference_sites` (array). WR-local
// `domain_name` (intended target meaning) is dropped.
const RENAMED_OR_DROPPED = new Set(["current_url", "inspiration_sites", "domain_name"]);
const brief = {};
for (const [k, v] of Object.entries(fd)) {
  if (k.startsWith("_")) continue;
  if (v === undefined || v === null || v === "") continue;
  if (RENAMED_OR_DROPPED.has(k)) continue;
  brief[k] = v;
}
brief.business_name = businessName;
brief.industry = industry;
// Send contact in EVERY form we can think of — flat, nested, and literal-dotted.
// SL's validator rejects two of these but won't tell us which one it wants.
brief.contact_email = contactEmail;
brief["contact.email"] = contactEmail;
const contactObj = { email: contactEmail };
if (fd.contact_phone && String(fd.contact_phone).trim()) contactObj.phone = fd.contact_phone;
const _person = fd.contact_person || fd.contact_name;
if (_person && String(_person).trim()) contactObj.person = _person;
brief.contact = contactObj;

if (fd.current_url) brief.domain_name = fd.current_url;
if (fd.inspiration_sites) {
  const text =
    typeof fd.inspiration_sites === "string"
      ? fd.inspiration_sites
      : Array.isArray(fd.inspiration_sites)
        ? fd.inspiration_sites.map((x) => String(x)).join("\n")
        : "";
  const matches = text.match(/https?:\/\/[^\s,)<>"']+/gi) || [];
  const cleaned = matches.map((u) => u.replace(/[.,;:!?)]+$/, ""));
  const urls = Array.from(new Set(cleaned));
  if (urls.length > 0) brief.reference_sites = urls;
}

if (isSales) brief.is_sales_rep_submission = true;

const slug =
  String(businessName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "client";

const ownerName =
  fd.contact_person ||
  fd.contact_name ||
  (contactEmail ? contactEmail.split("@")[0] : "Owner");

const formTypeRaw = fd._mode || "quick";
const formType = ["quick", "standard", "in-depth"].includes(formTypeRaw) ? formTypeRaw : "standard";

const payload = {
  external_id: token,
  form_type: formType,
  brief,
  kura: { owner_email: contactEmail, owner_name: ownerName, industry, slug },
  ...(CALLBACK ? { callback_url: CALLBACK } : {}),
  options: { priority: "normal" },
};

const rawBody = JSON.stringify(payload);

if (process.env.DEBUG_SL_PAYLOAD === "1") {
  console.log("\n--- Outbound raw body ---");
  console.log(rawBody);
  console.log("--- end raw body ---\n");
}
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = createHmac("sha256", SL_SECRET).update(`${timestamp}.${rawBody}`).digest("hex");

console.log(`\nDispatching to SL:`);
console.log(`  token:       ${token}`);
console.log(`  business:    ${businessName}`);
console.log(`  source:      ${fd._source || "—"}`);
console.log(`  form_type:   ${formType}`);
console.log(`  industry:    ${industry}`);
console.log(`  is_sales:    ${isSales}`);
console.log(`  URL:         ${SL_URL}\n`);

const res = await fetch(SL_URL, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-source-id": "wr",
    "x-api-key": SL_KEY,
    "x-timestamp": timestamp,
    "x-signature": signature,
  },
  body: rawBody,
});

const responseText = await res.text();
console.log(`SL responded: HTTP ${res.status}`);
console.log(`Body: ${responseText}\n`);

if (!res.ok) {
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(responseText);
} catch {
  console.error("Could not parse SL response as JSON; aborting DB insert.");
  process.exit(1);
}
const buildId = parsed.build_id;
const slStatus = parsed.status;

// Try to attach to the existing tracking task, if any
let taskId = null;
const { data: client } = await supabase
  .from("clients")
  .select("id")
  .eq("form_session_token", token)
  .maybeSingle();
if (client) {
  const { data: task } = await supabase
    .from("tasks")
    .select("id")
    .eq("client_id", client.id)
    .ilike("title", `%${businessName}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  taskId = task?.id || null;
}

const { error: insErr } = await supabase
  .from("build_jobs")
  .insert({
    token,
    form_type: formType,
    pipeline: "sitelaunchr",
    status: "queued",
    external_id: token,
    sl_build_id: buildId,
    sl_phase: slStatus,
    sl_phase_at: new Date().toISOString(),
    task_id: taskId,
  });

if (insErr) {
  console.error(`⚠️  SL dispatch succeeded (build_id=${buildId}) but build_jobs insert failed:`);
  console.error("   ", insErr.message);
  console.error("   The build IS running on SL's side — manually insert a build_jobs row to track it.");
  process.exit(1);
}

console.log(`✅ Re-dispatched: sl_build_id=${buildId}, status=${slStatus}`);
console.log(`   build_jobs row inserted; callbacks will drive it forward as normal.`);
if (taskId) console.log(`   Linked to task ${taskId.slice(0, 8)}.`);
