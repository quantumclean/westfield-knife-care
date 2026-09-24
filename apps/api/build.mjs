// Bundles the Lambda handler into a single ESM file. Terraform zips dist/.
import { build } from "esbuild";
import { rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await build({
  entryPoints: ["src/lambda.ts"],
  outfile: "dist/index.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  minify: true,
  // The AWS SDK v3 is provided by the Node 22 Lambda runtime.
  external: ["@aws-sdk/*"],
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: "info",
});
