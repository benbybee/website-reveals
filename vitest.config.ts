import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lib/templates/**/*.test.ts"],
    environment: "node",
  },
});
