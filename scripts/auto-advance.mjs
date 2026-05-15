/**
 * Auto-advance showcase builds one at a time.
 * Checks current build, auto-submits next when ready, stops at #16.
 * State tracked in scripts/.build-progress.json
 *
 * Usage: node scripts/auto-advance.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { config } from "dotenv";

config({ path: join(dirname(fileURLToPath(import.meta.url)), "../.env.local") });

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGRESS_FILE = join(__dirname, ".build-progress.json");
const TOTAL_BUILDS = 16;

const BUILD_NAMES = [
  "Summit Ridge Roofing",
  "Stillwater Yoga & Wellness",
  "Smoke & Oak BBQ",
  "Coral & Key Realty",
  "Muddy Paws Pet Salon",
  "Iron Lotus Tattoo",
  "Grace & Grain Photography",
  "Obsidian Auto Detail",
  "Honeycomb Bakehouse",
  "Harrington & Cole, Attorneys at Law",
  "Ridgeline Landscape Design",
  "Pulse Dance Company",
  "Clearview Dental",
  "Sparkle & Shine Home Services",
  "Ironclad Brewing Co.",
  "Maison Elara Interiors",
];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function loadProgress() {
  if (!existsSync(PROGRESS_FILE)) {
    return {
      completed: {
        1: { token: "f428789d", url: "https://wordpress-1595966-6273235.cloudwaysapps.com" },
        2: { token: "980f887e", url: "https://wordpress-1595966-6272607.cloudwaysapps.com" },
        3: { token: "1a8f6fbc", url: "https://wordpress-1595966-6273225.cloudwaysapps.com" },
      },
      active: { number: 4, token: "b8f8c7f3" },
    };
  }
  return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8"));
}

function saveProgress(p) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

function submitBuild(number) {
  const output = execSync(
    `node "${join(__dirname, "submit-showcase.mjs")}" ${number}`,
    { cwd: join(__dirname, ".."), encoding: "utf-8" }
  );
  const match = output.match(/token:\s*([a-f0-9-]{36})/i);
  if (!match) throw new Error(`Could not parse token from output:\n${output}`);
  return match[1];
}

async function checkToken(tokenOrPrefix) {
  // Full UUID: exact match. 8-char prefix: cast uuid to text for prefix search.
  const isFullUuid = tokenOrPrefix.length === 36;
  let query = supabase.from("build_jobs").select("token,status,site_url,created_at");
  if (isFullUuid) {
    query = query.eq("token", tokenOrPrefix);
  } else {
    query = query.filter("token::text", "ilike", `${tokenOrPrefix}%`);
  }
  const { data } = await query.order("created_at", { ascending: false }).limit(1).single();
  return data;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const progress = loadProgress();
const completedCount = Object.keys(progress.completed).length;
const now = new Date().toISOString();

console.log(`\nNow: ${now}`);
console.log(`Progress: ${completedCount}/${TOTAL_BUILDS} completed\n`);

// Print completed
for (const [num, info] of Object.entries(progress.completed).sort((a, b) => +a[0] - +b[0])) {
  console.log(`  ✅ #${String(num).padStart(2)} ${BUILD_NAMES[num - 1]} → ${info.url}`);
}

// Check active
if (progress.active) {
  const { number, token } = progress.active;
  const job = await checkToken(token);

  if (!job) {
    const submittedAt = progress.active.submittedAt;
    const ageMs = submittedAt ? Date.now() - new Date(submittedAt).getTime() : Infinity;
    if (ageMs < 120_000) {
      console.log(`\n  ⏳ #${number} (${BUILD_NAMES[number - 1]}) — submitted ${Math.round(ageMs/1000)}s ago, waiting for Supabase record...`);
      process.exit(0);
    }
    console.log(`\n  ⚠️  #${number} (${BUILD_NAMES[number - 1]}) — no Supabase record for token ${token} after 2+ min. Resubmitting...`);
    const newToken = submitBuild(number);
    progress.active = { number, token: newToken, submittedAt: new Date().toISOString() };
    saveProgress(progress);
    console.log(`  📤 Resubmitted → token: ${newToken.substring(0, 8)}`);
    process.exit(0);
  }

  const ageMin = Math.round((Date.now() - new Date(job.created_at).getTime()) / 60000);

  if (job.status === "deployed") {
    console.log(`\n  ✅ #${number} ${BUILD_NAMES[number - 1]} just deployed → ${job.site_url}`);
    progress.completed[number] = { token: job.token.substring(0, 8), url: job.site_url };
    progress.active = null;
    saveProgress(progress);

    const nextNumber = number + 1;
    if (nextNumber <= TOTAL_BUILDS) {
      console.log(`  📤 Submitting #${nextNumber}: ${BUILD_NAMES[nextNumber - 1]}...`);
      const newToken = submitBuild(nextNumber);
      progress.active = { number: nextNumber, token: newToken, submittedAt: new Date().toISOString() };
      saveProgress(progress);
      console.log(`  ✅ Submitted → token: ${newToken.substring(0, 8)}`);
    } else {
      console.log(`\n🎉 ALL ${TOTAL_BUILDS} BUILDS COMPLETE!`);
      for (const [num, info] of Object.entries(progress.completed).sort((a, b) => +a[0] - +b[0])) {
        console.log(`  #${String(num).padStart(2)} ${BUILD_NAMES[num - 1]} → ${info.url}`);
      }
    }

  } else if (job.status === "failed") {
    console.log(`\n  ❌ #${number} ${BUILD_NAMES[number - 1]} FAILED after ${ageMin}m. Resubmitting...`);
    const newToken = submitBuild(number);
    progress.active = { number, token: newToken, submittedAt: new Date().toISOString() };
    saveProgress(progress);
    console.log(`  📤 Resubmitted → token: ${newToken.substring(0, 8)}`);

  } else if (job.status === "building") {
    if (ageMin > 45) {
      console.log(`\n  ⚠️  POTENTIALLY STUCK: #${number} ${BUILD_NAMES[number - 1]} — ${ageMin}m building`);
    } else {
      console.log(`\n  🔨 #${number} ${BUILD_NAMES[number - 1]} — building (${ageMin}m)`);
    }

  } else {
    // queued or unknown
    if (ageMin > 30) {
      console.log(`\n  ⚠️  #${number} ${BUILD_NAMES[number - 1]} — stuck in '${job.status}' for ${ageMin}m. Resubmitting...`);
      const newToken = submitBuild(number);
      progress.active = { number, token: newToken, submittedAt: new Date().toISOString() };
      saveProgress(progress);
      console.log(`  📤 Resubmitted → token: ${newToken.substring(0, 8)}`);
    } else {
      console.log(`\n  ⏳ #${number} ${BUILD_NAMES[number - 1]} — ${job.status} (${ageMin}m)`);
    }
  }

} else if (completedCount < TOTAL_BUILDS) {
  const nextNumber = Math.max(...Object.keys(progress.completed).map(Number)) + 1;
  console.log(`\n  📤 No active build. Submitting #${nextNumber}: ${BUILD_NAMES[nextNumber - 1]}...`);
  const newToken = submitBuild(nextNumber);
  progress.active = { number: nextNumber, token: newToken, submittedAt: new Date().toISOString() };
  saveProgress(progress);
  console.log(`  ✅ Submitted → token: ${newToken.substring(0, 8)}`);

} else {
  console.log(`\n🎉 ALL ${TOTAL_BUILDS} BUILDS COMPLETE!`);
}
