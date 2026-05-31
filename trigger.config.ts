import { defineConfig } from "@trigger.dev/sdk/v3";
import { syncEnvVars } from "@trigger.dev/build/extensions/core";
import { config as loadEnvFile } from "dotenv";

// Server-side secrets the deployed tasks read at runtime. The syncEnvVars
// callback's `env` arg is the REMOTE project's existing vars, not local — so we
// read from process.env, loading .env.local first so the sync works on a plain
// `deploy` without relying on the --env-file flag. Explicit allowlist: never
// upload the whole env file. override:false leaves dashboard-set vars untouched.
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
      syncEnvVars(() => {
        loadEnvFile({ path: ".env.local" });
        const out: Record<string, string> = {};
        for (const key of SYNCED_ENV_VARS) {
          const value = process.env[key];
          if (value) out[key] = value;
        }
        return out;
      }),
    ],
  },
});
