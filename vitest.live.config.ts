import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["server/**/*.live.test.ts"],
    testTimeout: 60_000,
    passWithNoTests: true,
  },
});
