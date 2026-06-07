/**
 * Read-only: list recent tpl-discover / tpl-enrich runs on Trigger.dev with
 * status + error, so we can see why a discover run produced no data.
 */
import { runs, configure } from "@trigger.dev/sdk/v3";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
configure({ accessToken: env.TRIGGER_SECRET_KEY });

for (const taskId of ["tpl-discover", "tpl-enrich"]) {
  console.log(`\n=== Recent runs: ${taskId} ===`);
  let n = 0;
  try {
    for await (const r of runs.list({ taskIdentifier: taskId, limit: 5 })) {
      n++;
      console.log(`\n  run ${r.id}`);
      console.log(`    status:    ${r.status}`);
      console.log(`    created:   ${r.createdAt}`);
      console.log(`    finished:  ${r.finishedAt ?? "—"}`);
      if (r.error) console.log(`    error:     ${JSON.stringify(r.error)}`);
      if (r.output) console.log(`    output:    ${JSON.stringify(r.output)}`);
      if (n >= 5) break;
    }
    if (n === 0) console.log("  (no runs found)");
  } catch (e) {
    console.log(`  query failed: ${e instanceof Error ? e.message : e}`);
  }
}
console.log("");
