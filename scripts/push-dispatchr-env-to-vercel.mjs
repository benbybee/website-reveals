/**
 * One-off: push WEBSITEREVEALS_DISPATCHR_* env vars from .env.local
 * to Vercel for all three environments. Idempotent — removes any
 * existing value first so re-running rotates cleanly.
 *
 * Usage: node scripts/push-dispatchr-env-to-vercel.mjs
 */
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const KEYS = ["WEBSITEREVEALS_DISPATCHR_WEBHOOK_URL", "WEBSITEREVEALS_DISPATCHR_WEBHOOK_SECRET"];
const ENVIRONMENTS = ["production", "preview", "development"];

const missing = KEYS.filter((k) => !env[k]);
if (missing.length > 0) {
  console.error(`Missing in .env.local: ${missing.join(", ")}`);
  process.exit(1);
}

function runCmd(args, valueToStdin = null) {
  return new Promise((resolve) => {
    const child = spawn("vercel", args, { stdio: ["pipe", "pipe", "pipe"], shell: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    if (valueToStdin !== null) child.stdin.write(valueToStdin);
    child.stdin.end();
  });
}

async function pushVar(name, value) {
  for (const e of ENVIRONMENTS) {
    await runCmd(["env", "rm", name, e, "--yes"]); // silent if missing
    const { code, stderr } = await runCmd(["env", "add", name, e], value);
    if (code !== 0) {
      console.error(`  ❌ ${name} (${e}): ${stderr.split("\n").filter(Boolean).pop()}`);
    } else {
      console.log(`  ✓ ${name} (${e})`);
    }
  }
}

console.log("Pushing Dispatchr env vars to Vercel…\n");
for (const k of KEYS) {
  console.log(`${k}:`);
  await pushVar(k, env[k]);
}
console.log("\nDone. Verify with: vercel env ls production | grep DISPATCHR");
