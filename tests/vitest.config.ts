import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["integration/**/*.test.ts"],
    testTimeout: 20_000,
    // Database tests share one database; run files sequentially.
    fileParallelism: false,
  },
});
