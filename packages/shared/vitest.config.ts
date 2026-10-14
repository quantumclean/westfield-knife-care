import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    reporters: process.env.WKC_TEST_DIAGNOSTICS ? ["default", "junit"] : ["default"],
    outputFile: { junit: "../../.tmp/unit-shared.xml" },
  },
});
