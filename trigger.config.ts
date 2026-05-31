import { defineConfig } from "@trigger.dev/sdk/v3";
import { syncEnvVars } from "@trigger.dev/build/extensions/core";

// Server-side secrets the deployed tasks read at runtime. Synced from the CLI
// process env at deploy time (populate it via `--env-file`). Explicit allowlist
// so we never upload the whole .env file. override:false leaves dashboard-set
// vars (e.g. Telegram) untouched.
const SYNCED_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "APIFY_TOKEN",
] as const;

export default defineConfig({
  project: "proj_peoqklwfpgsdsfttdwhr",
  runtime: "node",
  logLevel: "log",
  maxDuration: 1800,                 // 30 min global max (builds are long-running)
  dirs: ["src/trigger"],
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 1,                 // Don't retry builds — they're expensive
    },
  },
  build: {
    extensions: [
      syncEnvVars(({ env }) => {
        const out: Record<string, string> = {};
        for (const key of SYNCED_ENV_VARS) {
          const value = env[key];
          if (value) out[key] = value;
        }
        return out;
      }),
    ],
  },
});
