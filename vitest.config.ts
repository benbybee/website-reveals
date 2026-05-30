import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    include: ["lib/templates/**/*.test.ts"],
    environment: "node",
    // Windows + a path containing a space makes the default `forks` pool fail
    // with `spawn UNKNOWN`; worker_threads avoids child_process spawn entirely.
    pool: "threads",
  },
});
