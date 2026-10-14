import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
  test: {
    include: ["test/**/*.test.ts"],
    reporters: process.env.WKC_TEST_DIAGNOSTICS ? ["default", "junit"] : ["default"],
    outputFile: { junit: "../../.tmp/unit-web.xml" },
  },
});
