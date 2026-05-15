/**
 * One-off: read SiteLaunchr env vars from .env.local and push to Vercel
 * for all three environments (production, preview, development).
 *
 * Values are streamed via stdin so they never appear in shell history.
 * Existing vars are removed first so this is idempotent / safe to re-run.
 *
 * Usage: node scripts/push-sl-env-to-vercel.mjs
 */
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

function loadEnv(path) {
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

const env = loadEnv(".env.local");

// Secrets — pulled from .env.local
const SECRET_KEYS = [
  "SITELAUNCHR_API_KEY",
  "SITELAUNCHR_HMAC_SECRET",
  "SITELAUNCHR_CALLBACK_URL",
];

// Plain config — hardcoded
const PLAIN_VARS = {
  SITELAUNCHR_ENABLED: "1",
  SITELAUNCHR_SOURCES: "sales",
  SITELAUNCHR_API_URL: "https://www.joinsitelaunchr.com/api/builds",
  SITELAUNCHR_ESTIMATED_COST_USD: "4",
  SITELAUNCHR_TARGET_MINUTES: "18",
};

// Verify secret keys are present
const missing = SECRET_KEYS.filter((k) => !env[k]);
if (missing.length > 0) {
  console.error(`Missing in .env.local: ${missing.join(", ")}`);
  process.exit(1);
}

const ENVIRONMENTS = ["production", "preview", "development"];

function runCmd(args, valueToStdin = null) {
  return new Promise((resolve) => {
    const child = spawn("vercel", args, { stdio: ["pipe", "pipe", "pipe"], shell: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    if (valueToStdin !== null) {
      // NOTE: no trailing newline — Vercel CLI captures stdin verbatim and
      // would otherwise store the value as `actualValue\n`.
      child.stdin.write(valueToStdin);
    }
    child.stdin.end();
  });
}

async function pushVar(name, value) {
  for (const envName of ENVIRONMENTS) {
    // Remove existing (silent if it doesn't exist)
    await runCmd(["env", "rm", name, envName, "--yes"]);
    // Add fresh
    const { code, stderr } = await runCmd(["env", "add", name, envName], value);
    if (code !== 0) {
      console.error(`  ❌ ${name} (${envName}): ${stderr.split("\n").filter(Boolean).pop()}`);
    } else {
      console.log(`  ✓ ${name} (${envName})`);
    }
  }
}

console.log("Pushing SiteLaunchr env vars to Vercel…\n");

for (const k of SECRET_KEYS) {
  console.log(`${k}:`);
  await pushVar(k, env[k]);
}

for (const [k, v] of Object.entries(PLAIN_VARS)) {
  console.log(`${k}:`);
  await pushVar(k, v);
}

console.log("\nDone. Verify with: vercel env ls production");
