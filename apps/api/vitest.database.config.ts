import { defineConfig } from "vitest/config";

// Execute the scale fixture without competing unit-test workers. No remote D1 access.
export default defineConfig({
  test: {
    include: ["test/analytics-scale.test.ts", "test/d1-persistence.test.ts"],
    maxWorkers: 1,
    fileParallelism: false,
  },
});
