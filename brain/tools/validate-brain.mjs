#!/usr/bin/env node
/**
 * Universal Repo Brain — local validator (Tier 3).
 *
 * Runs the brain's self-checks: link integrity, brain-health, bootstrap
 * structure, standards install, command coverage, adapter consistency,
 * contract readiness, and vendor/implementation neutrality of the PORTABLE
 * doctrine (brain/standards/**). All checks are LOCAL — they cannot and do not
 * validate partner-repo conformance (that is /cross-repo-review's job).
 *
 * Usage: node brain/tools/validate-brain.mjs   (exit 0 = green, 1 = failures)
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BRAIN = join(ROOT, "brain");
const COMMANDS = join(ROOT, ".claude", "commands");
const STANDARDS = join(BRAIN, "standards");

let failures = 0;
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
}

function walk(dir, filterExt) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p, filterExt));
    else if (!filterExt || p.endsWith(filterExt)) out.push(p);
  }
  return out;
}

const rel = (p) => relative(ROOT, p).replace(/\\/g, "/");
// Strip fenced code blocks and inline code so diagrams / code samples don't
// produce false link matches or false neutrality hits.
function stripCode(md) {
  return md.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
}

// ---- Check 1: link integrity --------------------------------------------
const linkSources = [
  join(ROOT, "AGENTS.md"),
  join(ROOT, "CLAUDE.md"),
  ...walk(BRAIN, ".md"),
  ...walk(COMMANDS, ".md"),
];
const linkRe = /\[[^\]]+\]\(([^)]+)\)/g;
let brokenLinks = [];
let linkCount = 0;
for (const file of linkSources) {
  if (!existsSync(file)) continue;
  const body = stripCode(readFileSync(file, "utf8"));
  let m;
  while ((m = linkRe.exec(body)) !== null) {
    let target = m[1].trim();
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    target = target.split("#")[0];
    if (!target) continue;
    linkCount += 1;
    const resolved = resolve(dirname(file), target);
    if (!existsSync(resolved)) brokenLinks.push(`${rel(file)} -> ${target}`);
  }
}
check(
  `Link integrity (${linkCount} links)`,
  brokenLinks.length === 0,
  brokenLinks.length ? `broken:\n    ${brokenLinks.join("\n    ")}` : "",
);

// ---- Check 2: brain-health (core docs) ----------------------------------
const coreDocs = [
  "README.md", "how-to-use-this-brain.md", "current-state.md", "subsystem-map.md",
  "domain-index.md", "loop-register.md", "gap-matrix.md", "handoff.md",
];
const missingCore = coreDocs.filter((d) => !existsSync(join(BRAIN, d)));
check("Brain health (8 core docs)", missingCore.length === 0, missingCore.join(", "));

// ---- Check 3: bootstrap structure ---------------------------------------
const dirs = [
  "standards", "contracts", "loops", "decisions", "architecture",
  "features", "api", "database", "integrations", "maintenance", "tools",
];
const missingDirs = dirs.filter((d) => !existsSync(join(BRAIN, d)));
check("Bootstrap structure (11 dirs)", missingDirs.length === 0, missingDirs.join(", "));

// ---- Check 4: standards install -----------------------------------------
const stdFiles = [
  "loop-engineering-constitution.md", "repository-classification-standard.md",
  "loop-first-prd-standard.md", "evaluator-standard.md", "runtime-loop-standard.md",
  "contracts-framework.md", "adr-framework.md", "pattern-library.md",
];
const missingStd = stdFiles.filter((f) => !existsSync(join(STANDARDS, f)));
check("Standards install (8)", missingStd.length === 0, missingStd.join(", "));

// ---- Check 5: command coverage ------------------------------------------
const cmdFiles = [
  "architect.md", "plan-feature.md", "impact-analysis.md", "architecture-review.md",
  "cross-repo-review.md", "update-brain.md", "brain-health.md", "architecture-audit.md",
];
const missingCmd = cmdFiles.filter((f) => !existsSync(join(COMMANDS, f)));
check("Command coverage (8)", missingCmd.length === 0, missingCmd.join(", "));

// ---- Check 6: adapter consistency ---------------------------------------
const agentsExists = existsSync(join(ROOT, "AGENTS.md"));
let adapterOk = agentsExists;
let adapterDetail = agentsExists ? "" : "AGENTS.md missing";
if (existsSync(join(ROOT, "CLAUDE.md"))) {
  const claude = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");
  const refsAgents = /AGENTS\.md/.test(claude);
  const declaresAdapter = /adapter/i.test(claude);
  if (!refsAgents || !declaresAdapter) {
    adapterOk = false;
    adapterDetail = `CLAUDE.md must reference AGENTS.md (${refsAgents}) and declare itself an adapter (${declaresAdapter})`;
  }
}
check("Adapter consistency", adapterOk, adapterDetail);

// ---- Check 7: contract readiness ----------------------------------------
const contractsDir = join(BRAIN, "contracts");
const contractFiles = readdirSync(contractsDir).filter((f) => /^c\d.*\.md$/.test(f));
const requiredFields = [
  "Owner", "Consumers", "Direction", "Locality", "Lifecycle",
  "Conformance checks", "Failure", "Source files",
];
const registry = readFileSync(join(contractsDir, "README.md"), "utf8");
let contractProblems = [];
for (const f of contractFiles) {
  const body = readFileSync(join(contractsDir, f), "utf8");
  const miss = requiredFields.filter((field) => !body.includes(field));
  if (miss.length) contractProblems.push(`${f}: missing ${miss.join(", ")}`);
  if (!registry.includes(f)) contractProblems.push(`${f}: not listed in contracts/README.md`);
}
check(
  `Contract readiness (${contractFiles.length} contracts)`,
  contractProblems.length === 0,
  contractProblems.join("; "),
);

// ---- Checks 8 & 9: neutrality of portable doctrine ----------------------
const VENDOR_TOKENS = [
  "SiteLaunchr", "Dispatchr", "Kura", "Supabase", "Vercel", "Trigger.dev",
  "Apify", "Firecrawl", "Click2Mail", "Lob", "Resend", "Telegram", "Slack",
  "Anthropic", "Claude", "Next.js", "Postgres", "GoHighLevel", "Stripe", "Webflow",
];
const IMPL_TOKENS = [
  "tpl_", "build_jobs", "form_sessions", "dispatchBuild", "scoreRecord",
  "notifyDispatchr", "ANTHROPIC_API_KEY", "SITELAUNCHR_", "SL_TEMPLATE_",
  "external_id", "source_id", "tpl_prospects",
];
let vendorHits = [];
let implHits = [];
for (const file of walk(STANDARDS, ".md")) {
  const body = stripCode(readFileSync(file, "utf8"));
  for (const t of VENDOR_TOKENS) {
    if (new RegExp(`\\b${t.replace(/\./g, "\\.")}`, "i").test(body)) vendorHits.push(`${rel(file)}: ${t}`);
  }
  for (const t of IMPL_TOKENS) {
    if (body.includes(t)) implHits.push(`${rel(file)}: ${t}`);
  }
}
check("Vendor-neutral doctrine (standards)", vendorHits.length === 0, vendorHits.join("; "));
check("Implementation-neutral doctrine (standards)", implHits.length === 0, implHits.join("; "));

// ---- Report -------------------------------------------------------------
console.log("\n  Universal Repo Brain — validation (Tier 3, local)\n");
for (const r of results) {
  console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok || !r.detail ? "" : `\n        ${r.detail}`}`);
}
console.log("");
if (failures === 0) {
  console.log("  GREEN — all local checks pass.");
  console.log("  (Distributed-seam conformance is /cross-repo-review's job; local tools cannot read partner repos.)\n");
  process.exit(0);
} else {
  console.log(`  ${failures} check(s) failed. Fix and re-run.\n`);
  process.exit(1);
}
