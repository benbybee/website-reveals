import { defineConfig } from "@trigger.dev/sdk/v3";

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
});
